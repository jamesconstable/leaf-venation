import { hash2 } from "../noise";
import type { RibbonPoint } from "../ribbon";
import type { PreparedLeaf } from "../style";
import { leafLattice, visibleArea } from "./drawing";

/**
 * Mesophyll cells that live on the leaf rather than lying over it, computed
 * every frame (a prototype). Each cell grows around a site fixed to the leaf on
 * the shared lattice, so cells travel with the leaf as it grows; as the leaf
 * enlarges, new sites appear between the old ones and swell into place, like
 * cells dividing. Veins act as walls: a cell can't reach across the veins
 * nearest its site, so as a vein approaches, cells reshape to end along it.
 *
 * The cells form a power diagram (a weighted Voronoi diagram), in which points
 * along the veins also take part, so cells end where veins begin. Rather than
 * search for the nearest sites from every pixel, each site writes its distance
 * into the pixels within reach, keeping the nearest two.
 */

/** About this many pixels between cell sites. */
const SPACING = 8;
/** How far a site reaches, in spacings: enough to meet its neighbours. */
const REACH = 1.4;
/** How far sites step off a vein they lie on, from its edge, in spacings. */
const CLEARANCE = 0.2;
/** How the newest sites start: shrunk by this many spacings, squared. */
const NEWBORN = 0.9;

/** Points along the veins, a few pixels apart, with the vein's half width there. */
const veinPoints = (leaf: PreparedLeaf) => {
  const points: { x: number; y: number; halfWidth: number }[] = [];
  for (const vein of leaf.veins) {
    let last: { x: number; y: number } | undefined;
    for (const p of vein.centre) {
      if (last !== undefined && (p.x - last.x) ** 2 + (p.y - last.y) ** 2 < 16) continue;
      points.push(p);
      last = p;
    }
  }
  return points;
};

/** A short straight piece of a vein, placed in buckets by its midpoint. */
interface Segment {
  readonly x: number;
  readonly y: number;
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  readonly halfWidth: number;
}

/** The veins as short segments, about three pixels long, along their centre lines. */
const veinSegments = (leaf: PreparedLeaf): Segment[] =>
  leaf.veins.flatMap(({ centre }) => {
    const kept: RibbonPoint[] = [];
    centre.forEach((p, k) => {
      const last = kept.at(-1);
      if (
        last === undefined ||
        k === centre.length - 1 ||
        Math.hypot(p.x - last.x, p.y - last.y) >= 3
      ) {
        kept.push(p);
      }
    });
    return kept.slice(1).map((b, k) => {
      const a = kept[k] ?? b;
      return {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        ax: a.x,
        ay: a.y,
        bx: b.x,
        by: b.y,
        halfWidth: (a.halfWidth + b.halfWidth) / 2,
      };
    });
  });

/** A vein segment's line, as a wall: a cell may only claim pixels on its own site's side. */
interface Barrier {
  readonly ax: number;
  readonly ay: number;
  /** The segment's direction and length. */
  readonly tx: number;
  readonly ty: number;
  readonly length: number;
  /** The line's normal, pointing toward the site's side. */
  readonly nx: number;
  readonly ny: number;
}

const barrier = ({ ax, ay, bx, by }: Segment, x: number, y: number): Barrier => {
  const length = Math.hypot(bx - ax, by - ay) || 1;
  const [tx, ty] = [(bx - ax) / length, (by - ay) / length];
  let [nx, ny] = [-ty, tx];
  if ((x - ax) * nx + (y - ay) * ny < 0) [nx, ny] = [-nx, -ny];
  return { ax, ay, tx, ty, length, nx, ny };
};

/**
 * Whether (x, y) lies on the far side of a barrier from its site. The barrier
 * reaches only a little beyond its segment's ends, so it doesn't cut cells
 * beyond where a vein stops.
 */
const behind = ({ ax, ay, tx, ty, length, nx, ny }: Barrier, x: number, y: number) => {
  const along = (x - ax) * tx + (y - ay) * ty;
  const beyond = 0.6 * SPACING;
  return along > -beyond && along < length + beyond && (x - ax) * nx + (y - ay) * ny < 0;
};

/** The point on a segment nearest (x, y). */
const nearestOn = ({ ax, ay, bx, by }: Segment, x: number, y: number) => {
  const [dx, dy] = [bx - ax, by - ay];
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / lengthSquared));
  return { x: ax + t * dx, y: ay + t * dy };
};

/** A grid of points in square buckets, for finding the points near a position. */
const bucketed = <T extends { x: number; y: number }>(points: readonly T[], size: number) => {
  const buckets = new Map<number, T[]>();
  const key = (gx: number, gy: number) => gx * 100_003 + gy;
  for (const p of points) {
    const k = key(Math.floor(p.x / size), Math.floor(p.y / size));
    const bucket = buckets.get(k);
    if (bucket === undefined) buckets.set(k, [p]);
    else bucket.push(p);
  }
  /** Calls `visit` with every point within about one bucket of (x, y). */
  return (x: number, y: number, visit: (p: T) => void) => {
    const [gx, gy] = [Math.floor(x / size), Math.floor(y / size)];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) buckets.get(key(gx + dx, gy + dy))?.forEach(visit);
    }
  };
};

/** The cells' shading, as a grey image over the blade, for blending onto it. */
export const livingCells = (leaf: PreparedLeaf) => {
  const area = visibleArea(leaf, leaf.blade, 2 * SPACING);
  const xs = area.map((p) => p.x);
  const ys = area.map((p) => p.y);
  if (xs.length === 0) return undefined;
  const [left, top] = [Math.floor(Math.min(...xs)), Math.floor(Math.min(...ys))];
  // Pixels per screen unit: the screen's own resolution as it's magnified, up to a
  // point; beyond that the soft-edged cells are simply scaled up.
  const resolution = Math.min(leaf.magnification, 1.5);
  const width = Math.ceil((Math.ceil(Math.max(...xs)) - left + 1) * resolution);
  const height = Math.ceil((Math.ceil(Math.max(...ys)) - top + 1) * resolution);
  if (!(width > 0 && height > 0)) return undefined;
  const [toX, toY] = [
    (px: number) => left + px / resolution,
    (py: number) => top + py / resolution,
  ];

  // The nearest two power distances at each pixel, and whether the nearest is a vein.
  const first = new Float32Array(width * height).fill(Infinity);
  const second = new Float32Array(width * height).fill(Infinity);
  const ofVein = new Uint8Array(width * height);
  const splat = (
    x: number,
    y: number,
    reach: number,
    weight: number,
    vein: boolean,
    barriers: readonly Barrier[] = [],
  ) => {
    // Into this image's pixels.
    const [cx, cy] = [(x - left) * resolution, (y - top) * resolution];
    reach *= resolution;
    weight *= resolution * resolution;
    const [b0, b1] = barriers;
    const i0 = Math.max(0, Math.floor(cx - reach));
    const i1 = Math.min(width - 1, Math.ceil(cx + reach));
    const j0 = Math.max(0, Math.floor(cy - reach));
    const j1 = Math.min(height - 1, Math.ceil(cy + reach));
    for (let py = j0; py <= j1; py++) {
      const dy = py + 0.5 - cy;
      for (let px = i0; px <= i1; px++) {
        const dx = px + 0.5 - cx;
        if (
          (b0 !== undefined && behind(b0, toX(px + 0.5), toY(py + 0.5))) ||
          (b1 !== undefined && behind(b1, toX(px + 0.5), toY(py + 0.5)))
        ) {
          continue;
        }
        const squared = dx * dx + dy * dy;
        if (squared > reach * reach) continue;
        const d = squared - weight;
        const k = py * width + px;
        const f1 = first[k] ?? Infinity;
        if (d < f1) {
          second[k] = f1;
          first[k] = d;
          ofVein[k] = vein ? 1 : 0;
        } else if (d < (second[k] ?? Infinity)) {
          second[k] = d;
        }
      }
    }
  };

  // Veins claim the pixels nearest them, so cells stop at their edges.
  for (const p of veinPoints(leaf)) {
    splat(p.x, p.y, 0.75 * SPACING, (p.halfWidth + 1) ** 2, true);
  }
  const nearby = bucketed(veinSegments(leaf), SPACING);
  interface Near {
    segment: Segment;
    x: number;
    y: number;
    gap: number;
  }
  /**
   * The nearest vein segment to (x, y), and the nearest on another stretch of
   * vein (more than a few pixels from the first), if any.
   */
  const nearestVeins = (x: number, y: number): Near[] => {
    let first: Near | undefined;
    const candidates: Near[] = [];
    nearby(x, y, (segment) => {
      const p = nearestOn(segment, x, y);
      const near = {
        segment,
        x: p.x,
        y: p.y,
        gap: Math.hypot(p.x - x, p.y - y) - segment.halfWidth,
      };
      candidates.push(near);
      if (first === undefined || near.gap < first.gap) first = near;
    });
    if (first === undefined) return [];
    const nearest: Near = first;
    let other: Near | undefined;
    for (const near of candidates) {
      if (Math.hypot(near.x - nearest.x, near.y - nearest.y) <= 4) continue;
      if (other === undefined || near.gap < other.gap) other = near;
    }
    return other === undefined ? [nearest] : [nearest, other];
  };
  const shown = leaf.bladeScale * leaf.bladeScale;
  leafLattice(leaf, SPACING, 91, (x, y, i, j) => {
    // Sites ranked just below the cut-off are newborn; they grow in as the leaf does.
    const age = Math.min(1, (shown - hash2(i, j, 91)) / (0.25 * shown));
    // A site right on a vein steps a little off it, on whichever side it lies.
    let [sx, sy] = [x, y];
    let veins = nearestVeins(x, y);
    const [nearest] = veins;
    if (nearest !== undefined && nearest.gap < CLEARANCE * SPACING) {
      const distance = Math.hypot(x - nearest.x, y - nearest.y);
      const [ux, uy] =
        distance > 1e-6 ? [(x - nearest.x) / distance, (y - nearest.y) / distance] : [1, 0];
      const to = nearest.segment.halfWidth + CLEARANCE * SPACING;
      [sx, sy] = [nearest.x + ux * to, nearest.y + uy * to];
      veins = nearestVeins(sx, sy);
    }
    // Its cell can't reach across the veins nearest it.
    const barriers = veins
      .filter((p) => p.gap < REACH * SPACING)
      .map((p) => barrier(p.segment, sx, sy));
    splat(sx, sy, REACH * SPACING, -SPACING * SPACING * NEWBORN * (1 - age), false, barriers);
  });

  const out = document.createElement("canvas");
  [out.width, out.height] = [width, height];
  const context = out.getContext("2d");
  if (context === null) return undefined;
  const image = context.createImageData(width, height);
  for (let k = 0; k < first.length; k++) {
    const d1 = first[k] ?? Infinity;
    const d2 = second[k] ?? Infinity;
    // A typical cell interior, where no site reached.
    let value = 0.54;
    if (Number.isFinite(d1)) {
      const f1 = Math.sqrt(Math.max(0, d1));
      const f2 = Number.isFinite(d2) ? Math.sqrt(Math.max(0, d2)) : Infinity;
      // Walls where two cells meet, or a cell meets a vein.
      const wall = 1 - Math.min(1, (f2 - f1) / (2.2 * resolution));
      // Cells are darker toward their centres; a vein's own territory is even.
      const centre = ofVein[k] === 1 ? 0.5 : Math.max(0, 1 - f1 / (SPACING * resolution));
      value = 0.5 + 0.28 * wall + 0.08 * (1 - centre);
    }
    const v = Math.round(255 * value);
    image.data[4 * k] = v;
    image.data[4 * k + 1] = v;
    image.data[4 * k + 2] = v;
    image.data[4 * k + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return { canvas: out, left, top, scale: resolution };
};
