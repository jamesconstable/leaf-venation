import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { distanceSquared } from "../geometry/vector";
import { SpatialGrid } from "./spatialGrid";

const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 60 };
const coordinate = (max: number) => fc.double({ min: 0, max, noNaN: true });
const point = fc.tuple(coordinate(100), coordinate(60));

const build = (points: readonly (readonly [number, number])[], cellSize: number) => {
  const grid = new SpatialGrid(bounds, cellSize);
  const coordinates = { xs: points.map(([x]) => x), ys: points.map(([, y]) => y) };
  points.forEach(([x, y], i) => {
    grid.insert(i, x, y);
  });
  return { grid, coordinates };
};

const bruteNearest = (points: readonly (readonly [number, number])[], x: number, y: number) => {
  let best = -1;
  let bestD = Infinity;
  points.forEach(([px, py], i) => {
    const d = distanceSquared(x, y, px, py);
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
};

describe("SpatialGrid", () => {
  it("finds the same nearest point as brute force", () => {
    fc.assert(
      fc.property(
        fc.array(point, { minLength: 1, maxLength: 80 }),
        point,
        fc.double({ min: 0.5, max: 40, noNaN: true }),
        (points, [x, y], cellSize) => {
          const { grid, coordinates } = build(points, cellSize);
          expect(grid.nearest(coordinates, points.length, x, y)).toBe(bruteNearest(points, x, y));
        },
      ),
    );
  });

  it("agrees with brute force on whether any point is within a radius", () => {
    fc.assert(
      fc.property(
        fc.array(point, { maxLength: 80 }),
        point,
        fc.double({ min: 0, max: 30, noNaN: true }),
        (points, [x, y], radius) => {
          const { grid, coordinates } = build(points, 7);
          const expected = points.some(
            ([px, py]) => distanceSquared(x, y, px, py) < radius * radius,
          );
          expect(grid.anyWithin(coordinates, points.length, x, y, radius)).toBe(expected);
        },
      ),
    );
  });

  it("ignores points beyond the count limit", () => {
    const { grid, coordinates } = build(
      [
        [10, 10],
        [50, 50],
      ],
      5,
    );
    expect(grid.nearest(coordinates, 1, 49, 49)).toBe(0);
    expect(grid.anyWithin(coordinates, 1, 50, 50, 2)).toBe(false);
  });

  it("returns -1 when there are no points", () => {
    const { grid, coordinates } = build([], 5);
    expect(grid.nearest(coordinates, 0, 1, 1)).toBe(-1);
  });
});
