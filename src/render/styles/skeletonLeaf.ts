import { drawGhost, fillShadowOnly, makeTexture, pinnedPattern, polygonPath } from "../canvas";
import { tileableNoise } from "../noise";
import { ribbon, traceRibbon, type RibbonPoint } from "../ribbon";
import type { PreparedLeaf, Style } from "../style";
import { closedLine, fillShadowAt, LIGHT, shifted } from "./drawing";

/**
 * A skeleton leaf: the soft tissue has rotted away, leaving only the lace of
 * veins, golden and slightly translucent, laid on dark velvet. Each vein is a
 * small rounded strand, lit along one side and shaded along the other, casting
 * a soft shadow onto the cloth; a few scraps of membrane cling between them.
 */

/** Scraps of membrane, mostly gone. */
let membrane: HTMLCanvasElement | undefined;
const membraneTexture = () =>
  (membrane ??= makeTexture(256, 256, (context, width, height) => {
    const image = context.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const n = tileableNoise(x, y, width, height, 48, 4, 61);
        const i = 4 * (y * width + x);
        image.data[i] = 214;
        image.data[i + 1] = 180;
        image.data[i + 2] = 124;
        image.data[i + 3] = Math.round(255 * (0.04 + 0.22 * Math.max(0, n - 0.62) * 4));
      }
    }
    context.putImageData(image, 0, 0);
  }));

/** Strands are drawn a little stouter than the veins, so even the finest can be modelled. */
const strand = (centre: readonly RibbonPoint[]) =>
  centre.map((p) => ({ ...p, halfWidth: 0.35 + 1.25 * p.halfWidth }));

const drawLeaf = (context: CanvasRenderingContext2D, leaf: PreparedLeaf) => {
  drawGhost(context, leaf.ghost, "rgba(230, 200, 150, 0.35)");
  const blade = polygonPath(leaf.blade, leaf.bladeHoles);
  // The skeleton keeps a fine vein along the margin.
  const strands = [
    ...leaf.veins.map((vein) => strand(vein.centre)),
    closedLine(leaf.blade, 0.8),
    strand(leaf.petiole),
  ];
  const body = new Path2D();
  const shade = new Path2D();
  const highlight = new Path2D();
  for (const line of strands) {
    traceRibbon(body, ribbon(line));
    traceRibbon(shade, ribbon(shifted(line, -0.45, 0.55)));
    traceRibbon(highlight, ribbon(shifted(line, 0.4, 0.3)));
  }

  // A soft shadow on the velvet, cast away from the light.
  const lift = 0.006 * leaf.leafLength + 1.5;
  fillShadowAt(context, body, "rgba(0, 0, 0, 0.7)", 2 + lift, -LIGHT.x * lift, -LIGHT.y * lift);

  const pattern = pinnedPattern(context, membraneTexture(), leaf.base, leaf.leafLength / 300);
  if (pattern !== null) {
    context.fillStyle = pattern;
    context.fill(blade, "evenodd");
  }

  context.fillStyle = "#c39a5e";
  context.fill(body);
  context.save();
  context.clip(body);
  fillShadowOnly(context, shade, "rgba(96, 62, 26, 0.75)", 1);
  context.fillStyle = "rgba(255, 238, 196, 0.75)";
  context.fill(highlight);
  context.restore();
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
