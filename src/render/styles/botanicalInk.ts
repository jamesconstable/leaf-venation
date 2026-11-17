import type { Polygon } from "../../geometry/region";
import { drawGhost, fillShadowOnly, polygonPath } from "../canvas";
import { drawDots, type Dots } from "../dots";
import { hash2 } from "../noise";
import { ribbon, traceRibbon, type RibbonPoint } from "../ribbon";
import type { PreparedLeaf, Style } from "../style";
import {
  bladeTone,
  closedLine,
  curl,
  latticeGrid,
  leafLattice,
  paintTone,
  petioleEdges,
  shifted,
  wobble,
  type Tone,
} from "./drawing";

/**
 * Pen and ink in the manner of a stippled botanical study. The blade is shaded
 * with fine dots, lit from the upper right: the far half of the blade is in
 * shade, the blade darkens as it curves away toward the margin, and each vein
 * stands slightly proud, with shade on one side and light on the other. Veins
 * are left as lines of paper, and the midvein and petiole are modelled with
 * their own shading on their shadow side.
 */

const INK = "#241a14";
const INK_RGB = [0x24, 0x1a, 0x14] as const;
const PAPER = "#f3e9d3";

/** Half the margin's pen width, which the petiole's outline shares. */
const MARGIN_HALF_WIDTH = 0.8;

/** Veins and petiole share one wobble, so where they overlap their lines coincide. */
const inkLine = (centre: readonly RibbonPoint[]) =>
  wobble(centre, 0.7, 5).map((p) => ({ ...p, halfWidth: Math.max(0.5, p.halfWidth) }));

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
 * How strongly the blade's curl shades it. Any stronger and it swamps the
 * shading from the veins, tilting the whole blade dark on one side and light on
 * the other.
 */
export const INK_CURL = 0.08;

/**
 * The curl at each stipple mark, by its lattice index. A mark keeps its place
 * on the leaf as it grows, so its curl never changes; caching it saves
 * evaluating the noise surface for every mark on every frame. Kept until the
 * view or the random seed of the marks changes.
 */
let curlCache: { key: string; values: Float32Array } | undefined;
const curlValues = (leaf: PreparedLeaf, seed: number) => {
  const { bounds, view } = leaf;
  const key = [seed, view.scale, bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].join();
  if (curlCache?.key !== key) {
    const { columns, rows } = latticeGrid(leaf, SPACING);
    curlCache = { key, values: new Float32Array(columns * rows).fill(Number.NaN) };
  }
  return curlCache.values;
};

/** Stipples where the tone is dark, on the shared lattice (so the tone holds as the leaf grows). */
const stipple = (
  context: CanvasRenderingContext2D,
  leaf: PreparedLeaf,
  darkness: Tone,
  seed: number,
  /** Whether the blade's curl and a light ground of dots apply (not inside veins). */
  onBlade: boolean,
) => {
  const length = leaf.leafLength || 1;
  const curls = curlValues(leaf, seed);
  const dots: Dots = [];
  leafLattice(leaf, SPACING, seed, (x, y, i, j, index) => {
    let d = darkness(x, y);
    if (onBlade) {
      let c = curls[index] ?? 0;
      if (Number.isNaN(c)) {
        c = curl((x - leaf.base.x) / length, (y - leaf.base.y) / length, INK_CURL);
        curls[index] = c;
      }
      d = Math.max(0.08, d + c);
    }
    if (d <= 0.03 || hash2(i, j, seed + 3) > d) return;
    dots.push(x, y, 0.45 + 0.3 * d);
  });
  drawDots(context, dots, INK_RGB, 0.92);
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
  traceRibbon(margin, ribbon(wobble(closedLine(leaf.blade, MARGIN_HALF_WIDTH), 2.4, 21)));
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
 * edges are drawn with the margin's pen, starting where they leave the blade
 * (inside it, the midvein's finer edges carry on), and closed at the far end.
 */
const drawPetiole = (
  context: CanvasRenderingContext2D,
  petiole: readonly RibbonPoint[],
  blade: Polygon,
) => {
  const { left, right } = ribbon(inkLine(petiole));
  const shape = new Path2D();
  [...left, ...[...right].reverse()].forEach(({ x, y }, k) => {
    if (k === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  context.fillStyle = PAPER;
  context.fill(shape);
  const edges = petioleEdges(left, right, blade);
  context.strokeStyle = INK;
  context.lineCap = "round";
  context.lineWidth = 2 * MARGIN_HALF_WIDTH;
  context.stroke(edges);
};

const drawLeaf = (context: CanvasRenderingContext2D, leaf: PreparedLeaf) => {
  drawGhost(context, leaf.ghost, "rgba(36, 26, 20, 0.35)", [1.5, 4]);
  const blade = polygonPath(leaf.blade, leaf.bladeHoles);
  const tone = bladeTone(leaf, blade);
  if (tone !== undefined) {
    context.save();
    context.clip(blade, "evenodd");
    stipple(context, leaf, tone, 1, true);
    context.restore();
  }
  drawVeins(context, leaf);
  drawMargin(context, leaf);
  drawPetiole(context, leaf.petiole, leaf.blade);
  // Model the midvein and petiole: stipple their shadow sides, within their own outlines.
  const lines = reliefLines(leaf);
  const relief = reliefTone(lines);
  if (relief !== undefined) {
    const within = new Path2D();
    for (const line of lines) traceRibbon(within, ribbon(line));
    context.save();
    context.clip(within);
    stipple(context, leaf, relief, 11, false);
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
