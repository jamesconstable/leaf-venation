import { polygonContains, type Polygon } from "../../geometry/region";
import { drawGhost, polygonPath } from "../canvas";
import { scatter, valueNoise } from "../noise";
import { ribbon, traceRibbon, type RibbonPoint } from "../ribbon";
import type { PreparedLeaf, Style } from "../style";
import { toScreenX, toScreenY } from "../view";

const INK = "#2b2019";

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** Nudges a line sideways by smooth noise, as a steady but human hand would. */
const wobble = (points: readonly RibbonPoint[], amount: number, seed: number): RibbonPoint[] =>
  points.map((p) => ({
    x: p.x + amount * (valueNoise(p.x / 23, p.y / 23, seed) - 0.5),
    y: p.y + amount * (valueNoise(p.x / 23, p.y / 23, seed + 1) - 0.5),
    // Pen pressure varies slowly along the stroke.
    halfWidth: p.halfWidth * (0.8 + 0.4 * valueNoise(p.x / 41, p.y / 41, seed + 2)),
  }));

const wobblePolygon = (polygon: Polygon, amount: number, seed: number): Polygon =>
  wobble(
    polygon.map(({ x, y }) => ({ x, y, halfWidth: 0 })),
    amount,
    seed,
  ).map(({ x, y }) => ({ x, y }));

/**
 * Stippled shading, denser toward the lower right as if lit from the upper left,
 * and toward the margin. Dots are placed in leaf coordinates, so they grow with
 * the leaf rather than shimmering as it changes size.
 */
const stipple = (context: CanvasRenderingContext2D, leaf: PreparedLeaf) => {
  const { bounds, view, bladeScale } = leaf;
  const width = (bounds.maxX - bounds.minX) * view.scale * bladeScale;
  const height = (bounds.maxY - bounds.minY) * view.scale * bladeScale;
  const candidates = Math.round((width * height) / 12);
  const next = scatter(1);
  const dots = new Path2D();
  for (let n = 0; n < candidates; n++) {
    const u = next();
    const v = next();
    const keep = next();
    const x = toScreenX(view, (bounds.minX + u * (bounds.maxX - bounds.minX)) * bladeScale);
    const y = toScreenY(view, (bounds.minY + v * (bounds.maxY - bounds.minY)) * bladeScale);
    // Not context.isPointInPath, which ignores the canvas's device-pixel-ratio transform.
    if (!polygonContains(leaf.blade, x, y)) continue;
    if (leaf.bladeHoles.some((hole) => polygonContains(hole, x, y))) continue;
    // Shadowed side: away from light falling from the upper left.
    const side = clamp(0.5 + (u - 0.5) * 1.3 - (v - 0.5) * 0.7);
    // Toward the margin the blade curves away from the light.
    const radius = Math.sqrt(((u - 0.5) / 0.5) ** 2 + ((v - 0.5) / 0.5) ** 2);
    const rim = clamp((radius - 0.55) / 0.45);
    const shade = clamp(0.7 * side + 0.45 * rim * rim) ** 1.8;
    if (keep > shade * 0.8) continue;
    const r = 0.45 + 0.35 * next();
    dots.moveTo(x + r, y);
    dots.arc(x, y, r, 0, 2 * Math.PI);
  }
  context.fillStyle = "rgba(43, 32, 25, 0.75)";
  context.fill(dots);
};

const drawLeaf = (context: CanvasRenderingContext2D, leaf: PreparedLeaf) => {
  drawGhost(context, leaf.ghost, "rgba(43, 32, 25, 0.35)", [1.5, 4]);
  const blade = polygonPath(leaf.blade, leaf.bladeHoles);

  // A faint wash of sepia, as if the paper had been lightly tinted.
  context.fillStyle = "rgba(196, 160, 96, 0.12)";
  context.fill(blade, "evenodd");
  stipple(context, leaf);

  for (const vein of leaf.veins) {
    const path = new Path2D();
    traceRibbon(path, ribbon(wobble(vein.centre, 0.9, 5)));
    context.fillStyle = INK;
    context.fill(path);
  }

  // The margin, drawn twice with slightly different wobbles for a living ink line.
  context.lineJoin = "round";
  context.strokeStyle = INK;
  context.lineWidth = 1.3;
  context.stroke(polygonPath(wobblePolygon(leaf.blade, 1.2, 21)));
  context.globalAlpha = 0.45;
  context.lineWidth = 0.7;
  context.stroke(polygonPath(wobblePolygon(leaf.blade, 1.6, 33)));
  context.globalAlpha = 1;
};

export const botanicalInk: Style = {
  id: "botanical-ink",
  name: "Botanical ink",
  description: "Pen and ink on cream paper, stippled like a botanical plate",
  theme: {
    accent: "#7a3324",
    accentGlow: "rgba(170, 80, 50, 0.38)",
    onAccent: "#fbf3e4",
    panelTint: "rgba(251, 246, 234, 0.8)",
    panelBorder: "rgba(120, 96, 70, 0.28)",
    text: "#2b2019",
    muted: "#7a6a55",
    stage: "#efe5cf",
  },
  backdrop: {
    kind: "paper",
    paper: "#f2e8d2",
    fibre: "#c9b48e",
    vignette: "rgba(120, 90, 50, 0.22)",
  },
  overlay: { source: "#a33a22", kill: "rgba(163, 58, 34, 0.35)", node: INK },
  drawLeaf,
};
