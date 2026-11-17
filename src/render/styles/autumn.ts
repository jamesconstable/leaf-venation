import { polygonContains } from "../../geometry/region";
import { fillShadowOnly, fillShadowOnlyEvenOdd } from "../canvas";
import { hash2 } from "../noise";
import { ribbon, traceRibbon } from "../ribbon";
import type { PreparedLeaf, Style } from "../style";
import { backlitLeaf } from "./backlit";
import { leafLattice } from "./drawing";

/**
 * A leaf turning in autumn, held up to low sun. As chlorophyll breaks down, the
 * blade shows gold and orange, flushed with red in patches; a little green
 * lingers along the veins, where it breaks down last; the margin browns first;
 * and small spots of decay appear.
 */

/** Red flushing in from the margin, and green lingering well out from the main veins. */
const tint = (context: CanvasRenderingContext2D, leaf: PreparedLeaf, blade: Path2D) => {
  const length = leaf.leafLength;
  const outside = new Path2D();
  outside.rect(-1e5, -1e5, 2e5, 2e5);
  outside.addPath(blade);
  fillShadowOnlyEvenOdd(context, outside, "rgba(186, 30, 14, 0.85)", 0.09 * length);
  fillShadowOnlyEvenOdd(context, outside, "rgba(170, 20, 12, 0.7)", 0.03 * length);
  const veins = new Path2D();
  for (const vein of leaf.veins) {
    if (vein.order > 2) continue;
    traceRibbon(veins, ribbon(vein.centre.map((p) => ({ ...p, halfWidth: p.halfWidth * 7 }))));
  }
  fillShadowOnly(context, veins, "rgba(118, 148, 36, 0.8)", 0.045 * length);
};

/**
 * Browning in from the margin, and small brown spots, each with a paler halo,
 * fixed to the leaf so they grow with it.
 */
const decay = (context: CanvasRenderingContext2D, leaf: PreparedLeaf, blade: Path2D) => {
  const cores = new Path2D();
  const halos = new Path2D();
  leafLattice(leaf, 70, 41, (x, y, i, j) => {
    if (hash2(i, j, 44) > 0.22 || !polygonContains(leaf.blade, x, y)) return;
    const radius = (1 + 2.5 * hash2(i, j, 45)) * Math.max(0.4, leaf.bladeScale);
    cores.moveTo(x + radius, y);
    cores.arc(x, y, radius, 0, 2 * Math.PI);
    halos.moveTo(x + 2.4 * radius, y);
    halos.arc(x, y, 2.4 * radius, 0, 2 * Math.PI);
  });
  const outside = new Path2D();
  outside.rect(-1e5, -1e5, 2e5, 2e5);
  outside.addPath(blade);
  context.save();
  context.clip(blade, "evenodd");
  fillShadowOnlyEvenOdd(context, outside, "rgba(104, 36, 12, 0.7)", 0.03 * leaf.leafLength);
  fillShadowOnly(context, halos, "rgba(250, 210, 90, 0.5)", 3);
  fillShadowOnly(context, cores, "rgba(70, 30, 10, 0.85)", 1.2);
  context.restore();
};

export const autumn: Style = {
  id: "autumn",
  name: "Autumn",
  description: "A leaf turning gold and red, held up to low autumn sun",
  theme: {
    accent: "#b4521e",
    onAccent: "#fff6ec",
    card: "#f3ebdf",
    cardEdge: "rgba(120, 70, 30, 0.25)",
    text: "#2a1a10",
    muted: "#7a5f4a",
    stage: "#3a3a52",
  },
  // Hazy light through a turning canopy, with cold sky showing between the leaves.
  backdrop: {
    kind: "bokeh",
    deep: "#2c3456",
    mid: "#86788a",
    bright: "#fae6c0",
    cool: "#3f9ccc",
    foliage: ["#463a5c", "#c0542a", "#e08634", "#f2b04a", "#ffd27a"],
    lights: ["#fff0d4", "#ffc870", "#86cbea", "#ffffff"],
    sky: "#6fb4dc",
  },
  overlay: { source: "#2d5fb8", kill: "rgba(220, 235, 255, 0.55)", node: "#3a1606" },
  drawLeaf: backlitLeaf({
    ghost: "rgba(255, 236, 200, 0.5)",
    blade: "#d97a22",
    // Gold patches and red flushes.
    patches: { light: [250, 196, 60], shade: [176, 34, 18], alpha: 0.9 },
    warmth: ["rgba(255, 214, 110, 0.3)", "rgba(255, 214, 110, 0)"],
    cellAlpha: 0.3,
    veinShadow: "rgba(120, 40, 10, 0.4)",
    cores: ["rgb(250, 222, 124)", "rgba(248, 214, 110, 0.9)", "rgba(244, 204, 96, 0.8)"],
    rim: ["rgba(255, 196, 80, 0.2)", "rgba(255, 218, 120, 0.35)", "rgba(255, 236, 170, 0.8)"],
    hairline: "rgba(100, 40, 12, 0.7)",
    petioleHighlight: "rgba(255, 240, 190, 0.55)",
    petioleShadow: "rgba(40, 14, 4, 0.5)",
    tint,
    finish: decay,
  }),
};
