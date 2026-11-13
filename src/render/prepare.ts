import type { BoundingBox, Polygon, Region } from "../geometry/region";
import type { VenationSnapshot } from "../simulation/snapshot";
import { veinPaths } from "../simulation/veinPaths";
import { veinWidths } from "../simulation/veinWidth";
import { ribbon, smoothCentreLine, type RibbonPoint } from "./ribbon";
import type { PreparedLeaf, PreparedVein } from "./style";
import { fitView, toScreenX, toScreenY, type View } from "./view";

/** The part of the canvas the leaf should be framed in (e.g. clear of the options panel). */
export interface Frame {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** The finest veins are hairlines; the widest is this fraction of the current leaf's length. */
const FINEST_WIDTH = 0.6;
const WIDEST_FRACTION = 0.016;
const SAMPLES_PER_SEGMENT = 3;
/** The petiole's length as a fraction of the leaf's; the leaf is framed with room for it. */
const PETIOLE_LENGTH = 0.13;

const toScreen = (polygon: Polygon, view: View, scale: number): Polygon =>
  polygon.map(({ x, y }) => ({ x: toScreenX(view, x * scale), y: toScreenY(view, y * scale) }));

export const frameView = (bounds: BoundingBox, frame: Frame): View => {
  const view = fitView(bounds, frame.width, frame.height);
  return { ...view, offsetX: view.offsetX + frame.left, offsetY: view.offsetY + frame.top };
};

export const prepareLeaf = (
  blade: Region,
  snapshot: VenationSnapshot | undefined,
  frame: Frame,
  veinWidthExponent: number,
): PreparedLeaf => {
  const leafHeight = blade.bounds.maxY - blade.bounds.minY;
  const view = frameView(
    { ...blade.bounds, minY: Math.min(blade.bounds.minY, -1.08 * PETIOLE_LENGTH * leafHeight) },
    frame,
  );
  const bladeScale = snapshot?.bladeScale ?? 1;
  const leafLength = leafHeight * view.scale * bladeScale;
  const base = { x: toScreenX(view, 0), y: toScreenY(view, 0) };
  const outline = {
    view,
    bounds: blade.bounds,
    bladeScale,
    blade: toScreen(blade.outer, view, bladeScale),
    bladeHoles: blade.holes.map((hole) => toScreen(hole, view, bladeScale)),
    ghost: bladeScale < 1 ? toScreen(blade.outer, view, 1) : undefined,
    leafLength,
    base,
  };
  if (snapshot === undefined) {
    return { ...outline, veins: [], petiole: petiole(base, leafLength, FINEST_WIDTH / 2) };
  }

  const { xs, ys, parents, veinScale } = snapshot;
  const widths = veinWidths(parents, veinWidthExponent);
  const maxWidth = widths.reduce((max, w) => Math.max(max, w), 1);
  const widest = Math.max(FINEST_WIDTH, WIDEST_FRACTION * leafLength);
  const halfWidth = (w: number) =>
    (maxWidth === 1
      ? FINEST_WIDTH
      : FINEST_WIDTH + ((widest - FINEST_WIDTH) * (w - 1)) / (maxWidth - 1)) / 2;
  const sx = (i: number) => toScreenX(view, (xs[i] ?? 0) * veinScale);
  const sy = (i: number) => toScreenY(view, (ys[i] ?? 0) * veinScale);

  const prepare = (nodes: readonly number[], order: number, widthOf: (k: number) => number) => {
    const points: RibbonPoint[] = nodes.map((node, k) => ({
      x: sx(node),
      y: sy(node),
      halfWidth: halfWidth(widthOf(k)),
    }));
    const centre = smoothCentreLine(points, SAMPLES_PER_SEGMENT);
    const vein: PreparedVein = {
      centre,
      ribbon: ribbon(centre),
      order,
      halfWidth: points.reduce((max, p) => Math.max(max, p.halfWidth), 0),
    };
    return vein;
  };

  const paths = veinPaths(parents, widths);
  const nodeOrder = new Int32Array(parents.length);
  for (const { nodes, order } of paths) {
    // A branch's first node belongs to its parent vein.
    nodes.forEach((node, k) => {
      if (k > 0 || parents[node] === -1) nodeOrder[node] = order;
    });
  }
  const veins = paths.map(({ nodes, order }) =>
    // A branch's first point is the node it leaves from; give it the branch's own width.
    prepare(nodes, order, (k) => widths[nodes[Math.max(k, nodes.length > 1 ? 1 : 0)] ?? 0] ?? 1),
  );
  const { anastomoses } = snapshot;
  for (let k = 0; k + 1 < anastomoses.length; k += 2) {
    const [a, b] = [anastomoses[k] ?? 0, anastomoses[k + 1] ?? 0];
    // An anastomosis continues the finer of the two veins it joins.
    const width = Math.min(widths[a] ?? 1, widths[b] ?? 1);
    const order = Math.max(nodeOrder[a] ?? 1, nodeOrder[b] ?? 1);
    veins.push(prepare([a, b], order, () => width));
  }
  veins.sort((p, q) => p.halfWidth - q.halfWidth);
  const midvein = veins.reduce(
    (widest, vein) => Math.max(widest, vein.halfWidth),
    FINEST_WIDTH / 2,
  );
  return { ...outline, veins, petiole: petiole(base, leafLength, midvein) };
};

/**
 * The leaf stalk: a gentle curve down from the base, continuing the midvein and
 * tapering slightly before a small swelling where it would join the stem. It
 * starts a little inside the blade, so it overlaps the midvein and the margin
 * rather than butting against them.
 */
const petiole = (
  base: { x: number; y: number },
  leafLength: number,
  halfWidth: number,
): RibbonPoint[] =>
  Array.from({ length: 15 }, (_, k) => {
    const t = -0.15 + (1.15 * k) / 14;
    const below = Math.max(0, t);
    const swelling = t > 0.85 ? 1 + 2.2 * (t - 0.85) : 1;
    return {
      x: base.x + 0.035 * leafLength * below * below,
      y: base.y + PETIOLE_LENGTH * leafLength * t,
      halfWidth: Math.max(0.5, halfWidth * (1.05 - 0.3 * below) * swelling),
    };
  });
