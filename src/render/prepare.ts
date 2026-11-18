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
  /** The visible part of the screen, if not the whole leaf. */
  viewport?: BoundingBox,
  magnification = 1,
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
    magnification,
    ...(viewport === undefined ? {} : { viewport }),
  };
  if (snapshot === undefined) {
    return { ...outline, veins: [], petiole: petiole([], base, leafLength, FINEST_WIDTH / 2) };
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
  // The petiole continues the widest vein leaving the initial vein node nearest the base.
  const distance = ({ centre }: PreparedVein) =>
    centre[0] === undefined
      ? Infinity
      : Math.abs(centre[0].x - base.x) + Math.abs(centre[0].y - base.y);
  const midvein = paths
    .flatMap((path, k) => {
      const vein = veins[k];
      return vein !== undefined && parents[path.nodes[0] ?? 0] === -1 ? [vein] : [];
    })
    .reduce<PreparedVein | undefined>((best, vein) => {
      if (best === undefined) return vein;
      const [d, e] = [distance(vein), distance(best)];
      return d < e - 1 || (d <= e + 1 && vein.halfWidth > best.halfWidth) ? vein : best;
    }, undefined);
  const stalk = petiole(
    midvein?.centre ?? [],
    base,
    leafLength,
    midvein?.centre[0]?.halfWidth ?? FINEST_WIDTH / 2,
  );
  veins.sort((p, q) => p.halfWidth - q.halfWidth);
  return { ...outline, veins, petiole: stalk };
};

/**
 * The leaf stalk, continuing the midvein out of the base. It starts a short way
 * up the midvein, following its centre line exactly so the two overlap without
 * a seam, leaves the initial vein node in the midvein's own direction and with
 * its width, then bends smoothly to hang a little to one side, swelling
 * slightly where it would join the stem.
 */
export const petiole = (
  /** The midvein's centre line, starting at the initial vein node. */
  midvein: readonly RibbonPoint[],
  /** Where the petiole hangs from if there is no midvein yet. */
  base: { x: number; y: number },
  leafLength: number,
  halfWidth: number,
): RibbonPoint[] => {
  const root = midvein[0] ?? { ...base, halfWidth };
  // The overlap: the midvein's first stretch, walked back toward the root.
  const inside: RibbonPoint[] = [];
  let walked = 0;
  for (let k = 1; k < midvein.length && walked < 0.06 * leafLength; k++) {
    const [p, q] = [midvein[k - 1], midvein[k]];
    if (p === undefined || q === undefined) break;
    walked += Math.sqrt((q.x - p.x) ** 2 + (q.y - p.y) ** 2);
    inside.unshift(q);
  }
  // The direction the midvein leaves its root in (its first segment's, as the
  // smoothed centre line starts), reversed to point down the stalk.
  const next = midvein.find((p) => p.x !== root.x || p.y !== root.y);
  const [dx, dy] = next === undefined ? [0, -1] : [next.x - root.x, next.y - root.y];
  const norm = Math.sqrt(dx * dx + dy * dy) || 1;
  const [ux, uy] = [-dx / norm, -dy / norm];
  const length = PETIOLE_LENGTH * leafLength;
  // A cubic Bézier: tangent to the midvein at the root, hanging nearly straight down at the end.
  const p1 = { x: root.x + ux * 0.4 * length, y: root.y + uy * 0.4 * length };
  const p3 = { x: root.x + 0.035 * leafLength, y: root.y + length };
  const p2 = { x: p3.x - 0.01 * leafLength, y: p3.y - 0.4 * length };
  const outside = Array.from({ length: 13 }, (_, k) => {
    const t = k / 12;
    const s = 1 - t;
    const [a, b, c, d] = [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t];
    return {
      x: a * root.x + b * p1.x + c * p2.x + d * p3.x,
      y: a * root.y + b * p1.y + c * p2.y + d * p3.y,
      halfWidth: halfWidth * (t > 0.85 ? 1 + 1.6 * (t - 0.85) : 1),
    };
  });
  return [...inside, ...outside];
};
