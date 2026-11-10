import { distanceSquared } from "../geometry/vector";
import type { BoundingBox } from "../geometry/region";

/** Coordinates of indexed points, stored outside the grid. */
export interface Coordinates {
  readonly xs: ArrayLike<number>;
  readonly ys: ArrayLike<number>;
}

/**
 * A uniform grid of point indices for proximity queries. Points are added but
 * never removed. Each cell lists indices in insertion order, so a query can be
 * limited to the first `count` points inserted, which is what lets an
 * append-only store share one grid between successive states.
 *
 * Mutable for speed; owners keep it out of reach of other code.
 */
export class SpatialGrid {
  private readonly cells: (number[] | undefined)[];
  private readonly columns: number;
  private readonly rows: number;

  constructor(
    private readonly bounds: BoundingBox,
    private readonly cellSize: number,
  ) {
    this.columns = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cellSize));
    this.rows = Math.max(1, Math.ceil((bounds.maxY - bounds.minY) / cellSize));
    this.cells = new Array<number[] | undefined>(this.columns * this.rows);
  }

  insert(index: number, x: number, y: number): void {
    const cell = this.cellIndex(this.column(x), this.row(y));
    (this.cells[cell] ??= []).push(index);
  }

  /** Whether any of the first `count` points lies strictly within `radius` of (x, y). */
  anyWithin(points: Coordinates, count: number, x: number, y: number, radius: number): boolean {
    const radiusSquared = radius * radius;
    const c0 = this.column(x - radius);
    const c1 = this.column(x + radius);
    const r0 = this.row(y - radius);
    const r1 = this.row(y + radius);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        for (const i of this.cells[this.cellIndex(c, r)] ?? []) {
          if (i >= count) break;
          if (distanceSquared(x, y, points.xs[i] ?? NaN, points.ys[i] ?? NaN) < radiusSquared) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * The index of the nearest of the first `count` points to (x, y), or -1 if
   * there are none. Ties go to the lowest index, keeping results deterministic.
   */
  nearest(points: Coordinates, count: number, x: number, y: number): number {
    let best = -1;
    let bestDistanceSquared = Infinity;
    const visit = (c: number, r: number) => {
      for (const i of this.cells[this.cellIndex(c, r)] ?? []) {
        if (i >= count) break;
        const d = distanceSquared(x, y, points.xs[i] ?? NaN, points.ys[i] ?? NaN);
        if (d < bestDistanceSquared || (d === bestDistanceSquared && i < best)) {
          best = i;
          bestDistanceSquared = d;
        }
      }
    };
    const c0 = this.column(x);
    const r0 = this.row(y);
    const maxRing = Math.max(c0, this.columns - 1 - c0, r0, this.rows - 1 - r0);
    for (let ring = 0; ring <= maxRing; ring++) {
      for (let c = c0 - ring; c <= c0 + ring; c++) {
        if (c < 0 || c >= this.columns) continue;
        const onVerticalEdge = c === c0 - ring || c === c0 + ring;
        for (let r = r0 - ring; r <= r0 + ring; r += onVerticalEdge ? 1 : 2 * ring || 1) {
          if (r >= 0 && r < this.rows) visit(c, r);
        }
      }
      // Every point in a later ring is at least `ring` cells away from (x, y).
      const reach = ring * this.cellSize;
      if (best !== -1 && bestDistanceSquared <= reach * reach) break;
    }
    return best;
  }

  private column(x: number): number {
    const c = Math.floor((x - this.bounds.minX) / this.cellSize);
    return Math.min(this.columns - 1, Math.max(0, c));
  }

  private row(y: number): number {
    const r = Math.floor((y - this.bounds.minY) / this.cellSize);
    return Math.min(this.rows - 1, Math.max(0, r));
  }

  private cellIndex(column: number, row: number): number {
    return row * this.columns + column;
  }
}
