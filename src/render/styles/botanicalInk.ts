import type { Polygon } from "../../geometry/region";
import { drawGhost, fillShadowOnly, polygonPath } from "../canvas";
import { hash2, valueNoise } from "../noise";
import { ribbon, traceRibbon, type RibbonPoint } from "../ribbon";
import type { PreparedLeaf, PreparedVein, Style } from "../style";
import { toScreenX, toScreenY } from "../view";

/**
 * Pen and ink in the manner of an engraved botanical plate. The blade is shaded
 * with dense, fine hatching that follows its form; veins are left as thin,
 * uninked lines of paper, given their shape by the darker hatching beside them.
 */

const INK = "#2b2019";
const PAPER = "#f3e9d3";

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

/** A closed polygon as a ribbon centre line (the first point repeated at the end). */
const closedLine = (polygon: Polygon, halfWidth: number): RibbonPoint[] =>
  [...polygon, ...polygon.slice(0, 1)].map(({ x, y }) => ({ x, y, halfWidth }));

/** Darkness in [0, 1] at screen positions, read from a tone map painted at reduced resolution. */
interface ToneMap {
  readonly darkness: (x: number, y: number) => number;
}

const TONE_SCALE = 0.5;

const groupByWidth = (veins: readonly PreparedVein[], groups: number) => {
  const widest = veins.reduce((max, v) => Math.max(max, v.halfWidth), 0.3);
  const buckets: PreparedVein[][] = Array.from({ length: groups }, () => []);
  for (const vein of veins) {
    const index = Math.min(groups - 1, Math.floor(Math.sqrt(vein.halfWidth / widest) * groups));
    buckets[index]?.push(vein);
  }
  return buckets.map((group, i) => ({ group, halfWidth: widest * ((i + 0.5) / groups) ** 2 }));
};

/**
 * Paints the leaf's tones offscreen: lit from the upper left, in soft uneven
 * patches, darker where the blade curves away toward the margin, and darkest in
 * the soft hollows beside each vein.
 */
const paintToneMap = (leaf: PreparedLeaf, blade: Path2D): ToneMap | undefined => {
  const xs = leaf.blade.map((p) => p.x);
  const ys = leaf.blade.map((p) => p.y);
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
  context.save();
  context.clip(blade, "evenodd");

  const length = leaf.leafLength;
  const light = context.createLinearGradient(
    leaf.base.x - 0.4 * length,
    leaf.base.y - length,
    leaf.base.x + 0.4 * length,
    leaf.base.y,
  );
  light.addColorStop(0, "rgba(0, 0, 0, 0)");
  light.addColorStop(0.35, "rgba(0, 0, 0, 0.12)");
  light.addColorStop(1, "rgba(0, 0, 0, 0.5)");
  context.fillStyle = light;
  context.fill(blade);

  // Toward the margin the blade curves away from the light.
  const band = new Path2D();
  traceRibbon(band, ribbon(closedLine(leaf.blade, 0.03 * length)));
  fillShadowOnly(context, band, "rgba(0, 0, 0, 0.4)", 0.05 * length);

  // Hollows beside each vein.
  for (const { group, halfWidth } of groupByWidth(leaf.veins, 5)) {
    if (group.length === 0) continue;
    const path = new Path2D();
    for (const vein of group) {
      traceRibbon(path, ribbon(vein.centre.map((p) => ({ ...p, halfWidth: p.halfWidth * 2 }))));
    }
    fillShadowOnly(context, path, "rgba(0, 0, 0, 0.75)", 1.5 + halfWidth * 4);
  }
  context.restore();

  const pixels = context.getImageData(0, 0, width, height).data;
  return {
    darkness: (x, y) => {
      const i = Math.floor((x - left) * TONE_SCALE);
      const j = Math.floor((y - top) * TONE_SCALE);
      if (i < 0 || j < 0 || i >= width || j >= height) return 0;
      return (pixels[4 * (j * width + i) + 3] ?? 0) / 255;
    },
  };
};

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * Hatches the blade in the manner of an engraving. Each stroke starts at a
 * point on a jittered lattice and is traced a short way in both directions
 * along the contours of the tone map, so neighbouring strokes run roughly
 * parallel and curve with the form. Strokes appear only where the tone is dark
 * enough, grow longer where it is darker, and the darkest areas get a second,
 * crossing layer. Lattice points are fixed in leaf coordinates, so the hatching
 * grows with the leaf rather than shimmering as it changes size.
 */
const hatch = (context: CanvasRenderingContext2D, leaf: PreparedLeaf, tone: ToneMap) => {
  const { bounds, view, bladeScale } = leaf;
  // Gentle, uneven patches of tone, smooth across the leaf.
  const darkness = (x: number, y: number) => {
    const u = (x - leaf.base.x) / leaf.leafLength;
    const v = (y - leaf.base.y) / leaf.leafLength;
    return tone.darkness(x, y) + 0.16 * (valueNoise(u * 5, v * 5, 13) - 0.5);
  };
  // The direction of a contour, from the tone's gradient sampled over a few pixels.
  const contour = (x: number, y: number, cross: boolean): [number, number] => {
    const reach = 5;
    const gx = tone.darkness(x + reach, y) - tone.darkness(x - reach, y);
    const gy = tone.darkness(x, y + reach) - tone.darkness(x, y - reach);
    const flat = Math.hypot(gx, gy) < 0.02;
    const angle =
      (flat ? 0.7 + 0.3 * valueNoise(x / 80, y / 80) : Math.atan2(gy, gx) + Math.PI / 2) +
      (cross ? 1.05 : 0);
    return [Math.cos(angle), Math.sin(angle)];
  };
  const trace = (path: Path2D, x: number, y: number, length: number, cross: boolean) => {
    const steps = 4;
    const stepLength = length / (2 * steps);
    const points: [number, number][] = [[x, y]];
    for (const sign of [1, -1]) {
      let [px, py] = [x, y];
      let [previousX, previousY] = contour(x, y, cross);
      previousX *= sign;
      previousY *= sign;
      for (let k = 0; k < steps; k++) {
        let [dx, dy] = contour(px, py, cross);
        // Keep heading the same way: a contour's direction is only defined up to sign.
        if (dx * previousX + dy * previousY < 0) [dx, dy] = [-dx, -dy];
        px += dx * stepLength;
        py += dy * stepLength;
        [previousX, previousY] = [dx, dy];
        if (sign === 1) points.push([px, py]);
        else points.unshift([px, py]);
      }
    }
    points.forEach(([px, py], k) => {
      if (k === 0) path.moveTo(px, py);
      else path.lineTo(px, py);
    });
  };

  // About 3 pixels between strokes once the leaf is full size.
  const spacing = 3 / view.scale;
  const columns = Math.ceil((bounds.maxX - bounds.minX) / spacing);
  const rows = Math.ceil((bounds.maxY - bounds.minY) / spacing);
  const fine = new Path2D();
  const firm = new Path2D();
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const u = bounds.minX + (i + 0.8 * hash2(i, j, 1)) * spacing;
      const v = bounds.minY + (j + 0.8 * hash2(i, j, 2)) * spacing;
      const x = toScreenX(view, u * bladeScale);
      const y = toScreenY(view, v * bladeScale);
      const d = darkness(x, y);
      if (hash2(i, j, 3) > smoothstep(0.04, 0.55, d)) continue;
      trace(d > 0.5 ? firm : fine, x, y, 5 + 9 * d, false);
      if (d > 0.55 && hash2(i, j, 4) < smoothstep(0.55, 0.85, d))
        trace(fine, x, y, 4 + 5 * d, true);
    }
  }
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = INK;
  context.globalAlpha = 0.6;
  context.lineWidth = 0.45;
  context.stroke(fine);
  context.globalAlpha = 0.8;
  context.lineWidth = 0.6;
  context.stroke(firm);
  context.restore();
};

const drawVeins = (context: CanvasRenderingContext2D, leaf: PreparedLeaf) => {
  for (const vein of leaf.veins) {
    const line = wobble(vein.centre, 0.7, 5).map((p) => ({
      ...p,
      halfWidth: Math.max(0.5, p.halfWidth),
    }));
    const path = new Path2D();
    traceRibbon(path, ribbon(line));
    // Wider veins get a fine inked edge; finer ones are defined by the hatching alone.
    if (vein.order <= 2 && vein.halfWidth > 1) {
      context.strokeStyle = INK;
      context.globalAlpha = 0.7;
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

const drawPetiole = (context: CanvasRenderingContext2D, petiole: readonly RibbonPoint[]) => {
  const line = wobble(petiole, 0.8, 41);
  const shape = new Path2D();
  traceRibbon(shape, ribbon(line));
  context.fillStyle = PAPER;
  context.fill(shape);
  context.strokeStyle = INK;
  context.lineWidth = 0.8;
  context.stroke(shape);
  // Shade the stalk's far side with a firmer line.
  const shade = new Path2D();
  traceRibbon(
    shade,
    ribbon(line.map((p) => ({ ...p, x: p.x + p.halfWidth * 0.55, halfWidth: p.halfWidth * 0.35 }))),
  );
  context.fillStyle = INK;
  context.globalAlpha = 0.75;
  context.fill(shade);
  context.globalAlpha = 1;
};

const drawLeaf = (context: CanvasRenderingContext2D, leaf: PreparedLeaf) => {
  drawGhost(context, leaf.ghost, "rgba(43, 32, 25, 0.35)", [1.5, 4]);
  const blade = polygonPath(leaf.blade, leaf.bladeHoles);
  drawPetiole(context, leaf.petiole);
  const tone = paintToneMap(leaf, blade);
  if (tone !== undefined) {
    context.save();
    context.clip(blade, "evenodd");
    hatch(context, leaf, tone);
    context.restore();
  }
  drawVeins(context, leaf);
  drawMargin(context, leaf);
};

export const botanicalInk: Style = {
  id: "botanical-ink",
  name: "Botanical ink",
  description: "Pen and ink on cream paper, hatched like an engraved botanical plate",
  theme: {
    accent: "#7a3324",
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
