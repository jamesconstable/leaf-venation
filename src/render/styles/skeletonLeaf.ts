import { drawGhost, fillShadowOnly, makeTexture, pinnedPattern, polygonPath } from "../canvas";
import { tileableCells, tileableNoise } from "../noise";
import { ribbon, traceRibbon, type RibbonPoint } from "../ribbon";
import type { PreparedLeaf, Style } from "../style";
import { closedLine, fillShadowAt, LIGHT, shifted } from "./drawing";

/**
 * A skeleton leaf: the soft tissue has rotted away, leaving only the lace of
 * veins, golden and slightly translucent, laid on dark velvet. Each vein is a
 * small rounded strand, lit along one side and shaded along the other, casting
 * a soft shadow onto the cloth; between them, patches of the finest net of cell
 * walls survive.
 */

const LACE = 512;

/**
 * What's left of the mesophyll: the finest net of cell walls, golden like the
 * veins, surviving in ragged patches with a faint film of membrane between them.
 */
let lace: HTMLCanvasElement | undefined;
const laceTexture = () =>
  (lace ??= makeTexture(LACE, LACE, (context, width, height) => {
    const image = context.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const { f1, f2 } = tileableCells(x, y, width, height, 7, 63);
        const wall = Math.max(0, 1 - (f2 - f1) / 1.6) ** 1.5;
        // Ragged patches: broad noise, its edges frayed by finer noise.
        const broad = tileableNoise(x, y, width, height, 90, 4, 61);
        const fray = tileableNoise(x, y, width, height, 6, 2, 62);
        const kept = Math.min(1, Math.max(0, (broad + 0.25 * fray - 0.63) / 0.06));
        const i = 4 * (y * width + x);
        image.data[i] = 206;
        image.data[i + 1] = 166;
        image.data[i + 2] = 104;
        image.data[i + 3] = Math.round(255 * kept * (0.06 + 0.55 * wall));
      }
    }
    context.putImageData(image, 0, 0);
  }));

/** Strands are drawn a little stouter than the veins, so even the finest can be modelled. */
const strand = (centre: readonly RibbonPoint[]) =>
  centre.map((p) => ({ ...p, halfWidth: 0.35 + 1.25 * p.halfWidth }));

/** Rounded golden strands, lit along one side, casting a soft shadow on the velvet. */
const drawStrands = (
  context: CanvasRenderingContext2D,
  strands: readonly (readonly RibbonPoint[])[],
  lift: number,
) => {
  const body = new Path2D();
  const shade = new Path2D();
  const highlight = new Path2D();
  for (const line of strands) {
    traceRibbon(body, ribbon(line));
    traceRibbon(shade, ribbon(shifted(line, -0.45, 0.55)));
    traceRibbon(highlight, ribbon(shifted(line, 0.4, 0.3)));
  }
  fillShadowAt(context, body, "rgba(0, 0, 0, 0.7)", 2 + lift, -LIGHT.x * lift, -LIGHT.y * lift);
  context.fillStyle = "#c39a5e";
  context.fill(body);
  context.save();
  context.clip(body);
  fillShadowOnly(context, shade, "rgba(96, 62, 26, 0.75)", 1);
  context.fillStyle = "rgba(255, 238, 196, 0.75)";
  context.fill(highlight);
  context.restore();
};

const drawLeaf = (context: CanvasRenderingContext2D, leaf: PreparedLeaf) => {
  drawGhost(context, leaf.ghost, "rgba(230, 200, 150, 0.35)");
  const blade = polygonPath(leaf.blade, leaf.bladeHoles);
  const lift = 0.006 * leaf.leafLength + 1.5;

  // The lace lies flatter than the veins, so its shadow falls closer.
  const pattern = pinnedPattern(context, laceTexture(), leaf.base, leaf.leafLength / 600);
  if (pattern !== null) {
    const scale = context.getTransform().a;
    context.save();
    context.clip(blade, "evenodd");
    context.shadowColor = "rgba(0, 0, 0, 0.6)";
    context.shadowBlur = 1.5 * scale;
    context.shadowOffsetX = -LIGHT.x * 0.4 * lift * scale;
    context.shadowOffsetY = -LIGHT.y * 0.4 * lift * scale;
    context.fillStyle = pattern;
    context.fill(blade, "evenodd");
    context.restore();
  }

  // The skeleton keeps a fine vein along the margin, which stops either side of the petiole.
  const petiole = strand(leaf.petiole);
  const stalk = new Path2D();
  traceRibbon(stalk, ribbon(petiole));
  const outside = new Path2D();
  outside.rect(-1e5, -1e5, 2e5, 2e5);
  outside.addPath(stalk);
  context.save();
  context.clip(outside, "evenodd");
  drawStrands(context, [closedLine(leaf.blade, 0.8)], lift);
  context.restore();
  drawStrands(context, [...leaf.veins.map((vein) => strand(vein.centre)), petiole], lift);
};

export const skeletonLeaf: Style = {
  id: "skeleton-leaf",
  name: "Skeleton leaf",
  description: "Only the golden lace of veins remains, laid on dark velvet",
  theme: {
    accent: "#9c7742",
    onAccent: "#fff8ec",
    card: "#efe8dc",
    cardEdge: "rgba(90, 70, 40, 0.25)",
    text: "#241c14",
    muted: "#6f6252",
    stage: "#15120f",
  },
  backdrop: {
    kind: "paper",
    paper: "#1d1916",
    fibre: "#4a4038",
    vignette: "rgba(0, 0, 0, 0.75)",
  },
  overlay: { source: "#e86a4a", kill: "rgba(255, 220, 180, 0.35)", node: "#f5e2b8" },
  drawLeaf,
};
