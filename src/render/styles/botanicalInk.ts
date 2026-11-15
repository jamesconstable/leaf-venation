import type { Polygon } from "../../geometry/region";
import { drawGhost, fillShadowOnly, polygonPath } from "../canvas";
import { hash2, valueNoise } from "../noise";
import { ribbon, traceRibbon, type RibbonPoint } from "../ribbon";
import type { PreparedLeaf, PreparedVein, Style } from "../style";
import { toScreenX, toScreenY } from "../view";

/**
 * Pen and ink in the manner of a stippled botanical study. The blade is shaded
 * with fine dots, lit from the upper right: the far half of the blade is in
 * shade, the blade darkens as it curves away toward the margin, and each vein
 * stands slightly proud, with shade on one side and light on the other. Veins
 * are left as lines of paper, and the midvein and petiole are modelled with
 * their own shading on their shadow side.
 */

const INK = "#241a14";
const PAPER = "#f3e9d3";

/** The direction toward the light, in screen coordinates (upper right). */
const LIGHT = { x: 0.6, y: -0.8 };

/** Nudges a line sideways by smooth noise at two scales, as a steady but human hand would. */
const wobble = (points: readonly RibbonPoint[], amount: number, seed: number): RibbonPoint[] =>
  points.map((p) => {
    const nudge = (offset: number) =>
      amount * (valueNoise(p.x / 31, p.y / 31, seed + offset) - 0.5) +
      0.35 * amount * (valueNoise(p.x / 7, p.y / 7, seed + offset + 50) - 0.5);
    return {
      x: p.x + nudge(0),
      y: p.y + nudge(1),
      // Pen pressure varies slowly along the stroke.
      halfWidth: p.halfWidth * (0.75 + 0.5 * valueNoise(p.x / 41, p.y / 41, seed + 2)),
    };
  });

/** Veins and petiole share one wobble, so where they overlap their lines coincide. */
const inkLine = (centre: readonly RibbonPoint[]) =>
  wobble(centre, 0.7, 5).map((p) => ({ ...p, halfWidth: Math.max(0.5, p.halfWidth) }));

/** A closed polygon as a ribbon centre line (the first point repeated at the end). */
const closedLine = (polygon: Polygon, halfWidth: number): RibbonPoint[] =>
  [...polygon, ...polygon.slice(0, 1)].map(({ x, y }) => ({ x, y, halfWidth }));

/** A centre line moved toward or away from the light by a multiple of its own half width. */
const shifted = (centre: readonly RibbonPoint[], by: number, widthFactor: number) =>
  centre.map((p) => ({
    x: p.x + LIGHT.x * by * p.halfWidth,
    y: p.y + LIGHT.y * by * p.halfWidth,
    halfWidth: p.halfWidth * widthFactor,
  }));

/** Darkness in [0, 1] at screen positions, read from a tone map painted at reduced resolution. */
type Tone = (x: number, y: number) => number;

const TONE_SCALE = 0.5;

/** Paints darkness (as alpha) offscreen over the given screen area, and returns a reader for it. */
const paintTone = (
  area: readonly { x: number; y: number }[],
  paint: (context: CanvasRenderingContext2D) => void,
): Tone | undefined => {
  const xs = area.map((p) => p.x);
  const ys = area.map((p) => p.y);
  const [left, top] = [Math.min(...xs) - 4, Math.min(...ys) - 4];
  const width = Math.ceil((Math.max(...xs) + 4 - left) * TONE_SCALE);
  const height = Math.ceil((Math.max(...ys) + 4 - top) * TONE_SCALE);
  if (!(width > 0 && height > 0)) return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) return undefined;
  context.setTransform(TONE_SCALE, 0, 0, TONE_SCALE, -left * TONE_SCALE, -top * TONE_SCALE);
  paint(context);
  const pixels = context.getImageData(0, 0, width, height).data;
  return (x, y) => {
    const i = Math.floor((x - left) * TONE_SCALE);
    const j = Math.floor((y - top) * TONE_SCALE);
    if (i < 0 || j < 0 || i >= width || j >= height) return 0;
    return (pixels[4 * (j * width + i) + 3] ?? 0) / 255;
  };
};

const groupByWidth = (veins: readonly PreparedVein[], groups: number) => {
  const widest = veins.reduce((max, v) => Math.max(max, v.halfWidth), 0.3);
  const buckets: PreparedVein[][] = Array.from({ length: groups }, () => []);
  for (const vein of veins) {
    const index = Math.min(groups - 1, Math.floor(Math.sqrt(vein.halfWidth / widest) * groups));
    buckets[index]?.push(vein);
  }
  return buckets.map((group, i) => ({ group, halfWidth: widest * ((i + 0.5) / groups) ** 2 }));
};

/** Fills a shape's blurred shadow, moved by an offset in screen units. */
const fillShadowAt = (
  context: CanvasRenderingContext2D,
  path: Path2D,
  colour: string,
  blur: number,
  dx: number,
  dy: number,
) => {
  context.save();
  context.translate(dx, dy);
  fillShadowOnly(context, path, colour, blur);
  context.restore();
};

/** The blade's tones: the shaded half, the margin curving away, and each vein's relief. */
const bladeTone = (leaf: PreparedLeaf, blade: Path2D) =>
  paintTone(leaf.blade, (context) => {
    context.clip(blade, "evenodd");
    const length = leaf.leafLength;
    const { x, y } = leaf.base;
    // Light falls a little more strongly toward the right of the blade.
    const light = context.createLinearGradient(x - 0.5 * length, y, x + 0.5 * length, y);
    light.addColorStop(0, "rgba(0, 0, 0, 0.3)");
    light.addColorStop(1, "rgba(0, 0, 0, 0.14)");
    context.fillStyle = light;
    context.fill(blade);
    // The blade folds slightly along the midvein, so the half facing away from the light is in shade.
    // Veins are sorted by width, so the last of the first order is the widest.
    const midvein = leaf.veins.filter((vein) => vein.order <= 1).at(-1)?.centre ?? [];
    const tip = midvein.at(-1) ?? { x, y: y - length };
    const shade = new Path2D();
    shade.moveTo(x, y + length);
    for (const p of [leaf.base, ...midvein]) shade.lineTo(p.x, p.y);
    shade.lineTo(tip.x, tip.y - length);
    shade.lineTo(tip.x - 2 * length, tip.y - length);
    shade.lineTo(x - 2 * length, y + length);
    shade.closePath();
    fillShadowOnly(context, shade, "rgba(0, 0, 0, 0.6)", 0.03 * length);

    // Toward the margin the blade curves away from the light.
    const band = new Path2D();
    traceRibbon(band, ribbon(closedLine(leaf.blade, 0.025 * length)));
    fillShadowOnly(context, band, "rgba(0, 0, 0, 0.55)", 0.04 * length);

    // Veins stand proud: shade beside each on the side away from the light, light on the other.
    for (const { group, halfWidth } of groupByWidth(leaf.veins, 5)) {
      if (group.length === 0) continue;
      const path = new Path2D();
      for (const vein of group) traceRibbon(path, ribbon(vein.centre));
      const reach = 1.4 + 2 * halfWidth;
      const blur = 1.5 + 2.5 * halfWidth;
      fillShadowAt(context, path, "rgba(0, 0, 0, 1)", blur, -LIGHT.x * reach, -LIGHT.y * reach);
      context.globalCompositeOperation = "destination-out";
      fillShadowAt(context, path, "rgba(0, 0, 0, 0.75)", blur, LIGHT.x * reach, LIGHT.y * reach);
      context.globalCompositeOperation = "source-over";
    }
  });

/** Ribbons modelled in relief: the widest veins and the petiole. */
const reliefLines = (leaf: PreparedLeaf) => {
  const widest = leaf.veins.reduce((max, v) => Math.max(max, v.halfWidth), 0);
  return [
    ...leaf.veins
      .filter((vein) => vein.order <= 1 && vein.halfWidth >= 0.5 * widest && vein.halfWidth > 1)
      .map((vein) => inkLine(vein.centre)),
    inkLine(leaf.petiole),
  ];
};

/** Shade along the side of each relief ribbon facing away from the light. */
const reliefTone = (lines: readonly RibbonPoint[][]) =>
  paintTone(lines.flat(), (context) => {
    for (const line of lines) {
      const path = new Path2D();
      traceRibbon(path, ribbon(shifted(line, -0.75, 0.4)));
      const halfWidth = line.reduce((max, p) => Math.max(max, p.halfWidth), 0);
      fillShadowOnly(context, path, "rgba(0, 0, 0, 0.7)", 0.3 + 0.4 * halfWidth);
    }
  });

/** About this many pixels between candidate dots, whatever the leaf's size. */
const SPACING = 1.4;

/**
 * Stipples where the tone is dark. Candidate dots sit on a jittered lattice
 * fixed in the final leaf's coordinates, so they move with the leaf as it grows
 * rather than shimmering. While the leaf is small, the same lattice would crowd
 * its dots together, so only a fraction (by each dot's rank) is drawn, keeping
 * the density on screen, and so the overall tone, the same at every size: as the
 * leaf grows, new dots appear between the old.
 */
const stipple = (
  context: CanvasRenderingContext2D,
  leaf: PreparedLeaf,
  darkness: Tone,
  seed: number,
) => {
  const { bounds, view, bladeScale } = leaf;
  const spacing = SPACING / view.scale;
  const shown = bladeScale * bladeScale;
  const columns = Math.ceil((bounds.maxX - bounds.minX) / spacing);
  const firstRow = Math.floor(Math.min(bounds.minY, -0.2 * (bounds.maxY - bounds.minY)) / spacing);
  const lastRow = Math.ceil(bounds.maxY / spacing);
  const dots = new Path2D();
  for (let j = firstRow; j <= lastRow; j++) {
    for (let i = 0; i < columns; i++) {
      if (hash2(i, j, seed) >= shown) continue;
      const u = bounds.minX + (i + hash2(i, j, seed + 1)) * spacing;
      const v = (j + hash2(i, j, seed + 2)) * spacing;
      const x = toScreenX(view, u * bladeScale);
      const y = toScreenY(view, v * bladeScale);
      // Gentle, uneven patches of tone, as a hand never stipples quite evenly.
      const d =
        darkness(x, y) +
        0.12 *
          (valueNoise(
            (u * 6) / (bounds.maxY - bounds.minY),
            (v * 6) / (bounds.maxY - bounds.minY),
            13,
          ) -
            0.5);
      if (d <= 0.03 || hash2(i, j, seed + 3) > d) continue;
      const radius = 0.45 + 0.3 * d;
      dots.moveTo(x + radius, y);
      dots.arc(x, y, radius, 0, 2 * Math.PI);
    }
  }
  context.fillStyle = INK;
  context.globalAlpha = 0.92;
  context.fill(dots);
  context.globalAlpha = 1;
};

const drawVeins = (context: CanvasRenderingContext2D, leaf: PreparedLeaf) => {
  for (const vein of leaf.veins) {
    const path = new Path2D();
    traceRibbon(path, ribbon(inkLine(vein.centre)));
    // Wider veins get a fine inked edge; finer ones are defined by the stippling alone.
    if (vein.order <= 2 && vein.halfWidth > 1) {
      context.strokeStyle = INK;
      context.globalAlpha = 0.75;
      context.lineWidth = 0.6;
      context.stroke(path);
      context.globalAlpha = 1;
    }
    context.fillStyle = PAPER;
    context.fill(path);
  }
};

const drawMargin = (context: CanvasRenderingContext2D, leaf: PreparedLeaf) => {
  const margin = new Path2D();
  traceRibbon(margin, ribbon(wobble(closedLine(leaf.blade, 0.8), 2.4, 21)));
  context.fillStyle = INK;
  context.fill(margin);
  // A second, fainter pass, slightly astray, for a living line.
  const echo = new Path2D();
  traceRibbon(echo, ribbon(wobble(closedLine(leaf.blade, 0.35), 3, 33)));
  context.globalAlpha = 0.4;
  context.fill(echo);
  context.globalAlpha = 1;
};

/**
 * The petiole, drawn over the margin so the margin doesn't cut it off. Its
 * edges are open lines, continuing the midvein's, with only its far end closed.
 */
const drawPetiole = (context: CanvasRenderingContext2D, petiole: readonly RibbonPoint[]) => {
  const { left, right } = ribbon(inkLine(petiole));
  const shape = new Path2D();
  [...left, ...[...right].reverse()].forEach(({ x, y }, k) => {
    if (k === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  context.fillStyle = PAPER;
  context.fill(shape);
  const edges = new Path2D();
  for (const side of [left, right]) {
    side.forEach(({ x, y }, k) => {
      if (k === 0) edges.moveTo(x, y);
      else edges.lineTo(x, y);
    });
  }
  const [endLeft, endRight] = [left.at(-1), right.at(-1)];
  if (endLeft !== undefined && endRight !== undefined) {
    edges.moveTo(endLeft.x, endLeft.y);
    edges.lineTo(endRight.x, endRight.y);
  }
  context.strokeStyle = INK;
  context.globalAlpha = 0.8;
  context.lineWidth = 0.7;
  context.stroke(edges);
  context.globalAlpha = 1;
};

const drawLeaf = (context: CanvasRenderingContext2D, leaf: PreparedLeaf) => {
  drawGhost(context, leaf.ghost, "rgba(36, 26, 20, 0.35)", [1.5, 4]);
  const blade = polygonPath(leaf.blade, leaf.bladeHoles);
  const tone = bladeTone(leaf, blade);
  if (tone !== undefined) {
    context.save();
    context.clip(blade, "evenodd");
    stipple(context, leaf, tone, 1);
    context.restore();
  }
  drawVeins(context, leaf);
  drawMargin(context, leaf);
  drawPetiole(context, leaf.petiole);
  // Model the midvein and petiole: stipple their shadow sides, within their own outlines.
  const lines = reliefLines(leaf);
  const relief = reliefTone(lines);
  if (relief !== undefined) {
    const within = new Path2D();
    for (const line of lines) traceRibbon(within, ribbon(line));
    context.save();
    context.clip(within);
    stipple(context, leaf, relief, 11);
    context.restore();
  }
};

export const botanicalInk: Style = {
  id: "botanical-ink",
  name: "Botanical ink",
  description: "Pen and ink on cream paper, stippled like a botanical study",
  theme: {
    accent: "#7a5230",
    onAccent: "#fbf3e4",
    card: "#f6eedd",
    cardEdge: "rgba(110, 84, 56, 0.28)",
    text: "#2b2019",
    muted: "#7a6a55",
    stage: "#efe5cf",
  },
  backdrop: {
    kind: "paper",
    paper: PAPER,
    fibre: "#c9b48e",
    vignette: "rgba(96, 66, 32, 0.5)",
  },
  overlay: { source: "#a33a22", kill: "rgba(163, 58, 34, 0.35)", node: INK },
  drawLeaf,
};
