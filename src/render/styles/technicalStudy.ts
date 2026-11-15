import { drawGhost, polygonPath } from "../canvas";
import { ribbon, traceRibbon } from "../ribbon";
import type { PreparedLeaf, Style } from "../style";

/**
 * A measured drawing on graph paper, as in a laboratory notebook. Veins are
 * drawn at their true widths and coloured by vein order; the blade is lightly
 * section-hatched; and the leaf is annotated with its axis, its base, and
 * dimension lines giving its current length and width.
 */

const PAPER = "#f4f6f3";
const INK = "#13325c";
/** Vein colours by order: first, second, third, and finer. */
const ORDERS = ["#13325c", "#1d5a9e", "#3f86c4", "#7cb1dc"] as const;
const LABEL = '500 10px "Inter Variable", system-ui, sans-serif';

/** An arrowhead at `tip`, pointing away from `from`. */
const arrowhead = (path: Path2D, tip: { x: number; y: number }, from: { x: number; y: number }) => {
  const [dx, dy] = [tip.x - from.x, tip.y - from.y];
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  const [ux, uy] = [dx / length, dy / length];
  path.moveTo(tip.x - 6 * ux + 2.2 * uy, tip.y - 6 * uy - 2.2 * ux);
  path.lineTo(tip.x, tip.y);
  path.lineTo(tip.x - 6 * ux - 2.2 * uy, tip.y - 6 * uy + 2.2 * ux);
};

const label = (
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  angle = 0,
  align: CanvasTextAlign = "center",
) => {
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.font = LABEL;
  context.textAlign = align;
  context.textBaseline = "middle";
  // A patch of paper behind the text, so lines don't run through it.
  const width = context.measureText(text).width;
  const left = align === "center" ? -width / 2 : align === "right" ? -width : 0;
  context.fillStyle = PAPER;
  context.fillRect(left - 3, -7, width + 6, 14);
  context.fillStyle = INK;
  context.fillText(text, 0, 0);
  context.restore();
};

/** The leaf's axis, base mark, dimension lines and figure label. */
const annotate = (context: CanvasRenderingContext2D, leaf: PreparedLeaf) => {
  const xs = leaf.blade.map((p) => p.x);
  const ys = leaf.blade.map((p) => p.y);
  if (xs.length === 0) return;
  const [minX, maxX, minY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys)];
  const { base } = leaf;
  const stalkEnd = leaf.petiole.at(-1) ?? base;

  context.save();
  context.strokeStyle = INK;
  context.lineWidth = 0.75;

  // The axis: a dash-dot centre line through the base.
  context.globalAlpha = 0.6;
  context.setLineDash([10, 3, 2, 3]);
  context.beginPath();
  context.moveTo(base.x, minY - 26);
  context.lineTo(base.x, stalkEnd.y + 12);
  context.stroke();
  context.setLineDash([]);
  context.globalAlpha = 1;

  // The base: a small circle and cross.
  context.beginPath();
  context.arc(base.x, base.y, 3.5, 0, 2 * Math.PI);
  context.moveTo(base.x - 7, base.y);
  context.lineTo(base.x + 7, base.y);
  context.stroke();

  // Length, to the right: extension lines from the tip and base, then the dimension line.
  const lengthX = maxX + 22;
  const width = new Path2D();
  const lines = new Path2D();
  lines.moveTo(base.x + 9, minY);
  lines.lineTo(lengthX + 5, minY);
  lines.moveTo(base.x + 9, base.y);
  lines.lineTo(lengthX + 5, base.y);
  lines.moveTo(lengthX, minY);
  lines.lineTo(lengthX, base.y);
  arrowhead(lines, { x: lengthX, y: minY }, { x: lengthX, y: base.y });
  arrowhead(lines, { x: lengthX, y: base.y }, { x: lengthX, y: minY });
  // Width, above: extension lines up from the widest points.
  const widthY = minY - 14;
  const left = leaf.blade.find((p) => p.x === minX) ?? { x: minX, y: minY };
  const right = leaf.blade.find((p) => p.x === maxX) ?? { x: maxX, y: minY };
  width.moveTo(left.x, left.y - 6);
  width.lineTo(left.x, widthY - 5);
  width.moveTo(right.x, right.y - 6);
  width.lineTo(right.x, widthY - 5);
  width.moveTo(left.x, widthY);
  width.lineTo(right.x, widthY);
  arrowhead(width, { x: left.x, y: widthY }, { x: right.x, y: widthY });
  arrowhead(width, { x: right.x, y: widthY }, { x: left.x, y: widthY });
  context.globalAlpha = 0.85;
  context.stroke(lines);
  context.globalAlpha = 0.4;
  context.stroke(width);
  context.restore();

  // Sizes as fractions of the final leaf's length.
  const final = leaf.leafLength / leaf.bladeScale;
  label(
    context,
    `L ${(leaf.leafLength / final).toFixed(2)}`,
    lengthX,
    (minY + base.y) / 2,
    -Math.PI / 2,
  );
  label(context, `W ${((maxX - minX) / final).toFixed(2)}`, (left.x + right.x) / 2, widthY);
  label(context, "FIG. 1", minX, stalkEnd.y + 4, 0, "left");
};

const drawLeaf = (context: CanvasRenderingContext2D, leaf: PreparedLeaf) => {
  drawGhost(context, leaf.ghost, "rgba(19, 50, 92, 0.35)", [3, 3]);
  const blade = polygonPath(leaf.blade, leaf.bladeHoles);
  context.fillStyle = "rgba(29, 78, 137, 0.05)";
  context.fill(blade, "evenodd");

  // Light section hatching across the blade.
  context.save();
  context.clip(blade, "evenodd");
  const xs = leaf.blade.map((p) => p.x);
  const ys = leaf.blade.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const hatching = new Path2D();
  for (let k = minX - (maxY - minY); k < maxX; k += 7) {
    hatching.moveTo(k, maxY);
    hatching.lineTo(k + (maxY - minY), minY);
  }
  context.strokeStyle = "rgba(29, 78, 137, 0.12)";
  context.lineWidth = 0.5;
  context.stroke(hatching);
  context.restore();

  // Veins at their true widths, coloured by order, finest first.
  const byOrder = ORDERS.map(() => new Path2D());
  for (const vein of leaf.veins) {
    const path = byOrder[Math.min(vein.order, ORDERS.length) - 1];
    if (path !== undefined) traceRibbon(path, vein.ribbon);
  }
  for (let k = ORDERS.length - 1; k >= 0; k--) {
    const path = byOrder[k];
    if (path === undefined) continue;
    context.fillStyle = ORDERS[k] ?? INK;
    context.fill(path);
  }

  context.strokeStyle = INK;
  context.lineWidth = 1.2;
  context.stroke(blade);

  // The petiole continues the midvein, over the margin.
  const stalk = new Path2D();
  traceRibbon(stalk, ribbon(leaf.petiole));
  context.fillStyle = ORDERS[0];
  context.fill(stalk);

  // Annotations need room: leave them off small drawings, such as the style swatches.
  if (leaf.leafLength / leaf.bladeScale > 160) annotate(context, leaf);
};

export const technicalStudy: Style = {
  id: "technical-study",
  name: "Technical study",
  description: "A measured drawing on graph paper, veins coloured by order",
  theme: {
    accent: "#1d4e89",
    onAccent: "#f3f7fc",
    card: "#f4f6f8",
    cardEdge: "rgba(30, 60, 100, 0.22)",
    text: "#14202e",
    muted: "#56657a",
    stage: PAPER,
  },
  backdrop: {
    kind: "paper",
    paper: PAPER,
    fibre: "#b9c6cf",
    vignette: "rgba(40, 60, 80, 0.18)",
    grid: { minor: "rgba(40, 110, 150, 0.14)", major: "rgba(40, 110, 150, 0.3)", spacing: 10 },
  },
  overlay: { source: "#d9472b", kill: "rgba(217, 71, 43, 0.35)", node: INK },
  suggestedOverlays: { auxinSources: true, veinNodes: true },
  drawLeaf,
};
