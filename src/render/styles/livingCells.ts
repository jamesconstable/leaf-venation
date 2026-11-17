import { hash2 } from "../noise";
import type { PreparedLeaf } from "../style";
import { leafLattice } from "./drawing";

/**
 * Mesophyll cells that live on the leaf rather than lying over it, computed
 * every frame (a prototype). Each cell grows around a site fixed to the leaf on
 * the shared lattice, so cells travel with the leaf as it grows; as the leaf
 * enlarges, new sites appear between the old ones and swell into place, like
 * cells dividing. Veins act as walls: cells stop at them, and a cell whose site
 * a vein approaches shrinks away, its neighbours reshaping around the vein.
 *
 * The cells form a power diagram (a weighted Voronoi diagram), in which points
 * along the veins also take part, so cells end where veins begin. Rather than
 * search for the nearest sites from every pixel, each site writes its distance
 * into the pixels within reach, keeping the nearest two.
 */

/** About this many pixels between cell sites. */
const SPACING = 8;
/** How far a site reaches, in spacings: enough to meet its neighbours. */
const REACH = 1.3;
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
  const xs = leaf.blade.map((p) => p.x);
  const ys = leaf.blade.map((p) => p.y);
  if (xs.length === 0) return undefined;
  const [left, top] = [Math.floor(Math.min(...xs)), Math.floor(Math.min(...ys))];
  const width = Math.ceil(Math.max(...xs)) - left + 1;
  const height = Math.ceil(Math.max(...ys)) - top + 1;
  if (!(width > 0 && height > 0)) return undefined;

  // The nearest two power distances at each pixel, and whether the nearest is a vein.
  const first = new Float32Array(width * height).fill(Infinity);
  const second = new Float32Array(width * height).fill(Infinity);
  const ofVein = new Uint8Array(width * height);
  const splat = (x: number, y: number, reach: number, weight: number, vein: boolean) => {
    const [cx, cy] = [x - left, y - top];
    const i0 = Math.max(0, Math.floor(cx - reach));
    const i1 = Math.min(width - 1, Math.ceil(cx + reach));
    const j0 = Math.max(0, Math.floor(cy - reach));
    const j1 = Math.min(height - 1, Math.ceil(cy + reach));
    for (let py = j0; py <= j1; py++) {
      const dy = py + 0.5 - cy;
      for (let px = i0; px <= i1; px++) {
        const dx = px + 0.5 - cx;
        const d = dx * dx + dy * dy - weight;
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
  const points = veinPoints(leaf);
  for (const p of points) splat(p.x, p.y, 0.75 * SPACING, (p.halfWidth + 0.5) ** 2, true);
  const nearby = bucketed(points, SPACING);

  const shown = leaf.bladeScale * leaf.bladeScale;
  leafLattice(leaf, SPACING, 91, (x, y, i, j) => {
    // Sites ranked just below the cut-off are newborn; they grow in as the leaf does.
    const age = Math.min(1, (shown - hash2(i, j, 91)) / (0.25 * shown));
    // A site close to a vein is crowded out by it.
    let gap = Infinity;
    nearby(x, y, (p) => {
      gap = Math.min(gap, Math.hypot(p.x - x, p.y - y) - p.halfWidth);
    });
    const crowding = Math.min(1, Math.max(0, 1 - gap / (0.4 * SPACING)));
    const shrink = Math.max(1 - age, crowding);
    splat(x, y, REACH * SPACING, -SPACING * SPACING * NEWBORN * shrink, false);
  });

  const out = document.createElement("canvas");
  [out.width, out.height] = [width, height];
  const context = out.getContext("2d");
  if (context === null) return undefined;
  const image = context.createImageData(width, height);
  for (let k = 0; k < first.length; k++) {
    const d1 = first[k] ?? Infinity;
    const d2 = second[k] ?? Infinity;
    let value = 0.5;
    if (Number.isFinite(d1)) {
      const f1 = Math.sqrt(Math.max(0, d1));
      const f2 = Number.isFinite(d2) ? Math.sqrt(Math.max(0, d2)) : Infinity;
      // Walls where two cells meet, or a cell meets a vein.
      const wall = 1 - Math.min(1, (f2 - f1) / 2.2);
      // Cells are darker toward their centres; a vein's own territory is even.
      const centre = ofVein[k] === 1 ? 0.5 : Math.max(0, 1 - f1 / SPACING);
      value = 0.5 + 0.28 * wall + 0.08 * (1 - centre);
    }
    const v = Math.round(255 * value);
    image.data[4 * k] = v;
    image.data[4 * k + 1] = v;
    image.data[4 * k + 2] = v;
    image.data[4 * k + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return { canvas: out, left, top };
};
