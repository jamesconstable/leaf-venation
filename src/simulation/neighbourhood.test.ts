import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  delaunayNeighbours,
  exactRelativeNeighbourhood,
  triangulateVeinNodes,
  urquhartNeighbourhood,
} from "./neighbourhood";
import { appendVeinNodes, emptyVeinNodes } from "./veinNodes";

const bounds = { minX: 0, minY: 0, maxX: 50, maxY: 50 };
const coordinate = fc.integer({ min: 0, max: 5000 }).map((n) => n / 100);
const point = fc.tuple(coordinate, coordinate);

const veinNodesAt = (points: readonly (readonly [number, number])[]) => {
  const appender = appendVeinNodes(emptyVeinNodes(bounds, 5));
  const seen = new Set<string>();
  for (const [x, y] of points) {
    // Coincident vein nodes never occur in a simulation (new nodes keep a minimum separation).
    if (seen.has(`${x},${y}`)) continue;
    seen.add(`${x},${y}`);
    appender.append(x, y, -1);
  }
  return appender.finish();
};

describe("neighbourhoods", () => {
  it("never misses a node of the exact relative neighbourhood (Urquhart is a superset)", () => {
    fc.assert(
      fc.property(fc.array(point, { minLength: 1, maxLength: 40 }), point, (points, [sx, sy]) => {
        const nodes = veinNodesAt(points);
        const triangulation = triangulateVeinNodes(nodes, bounds);
        const urquhart = new Set(urquhartNeighbourhood(triangulation, sx, sy));
        for (const v of exactRelativeNeighbourhood(nodes, sx, sy)) {
          expect(urquhart.has(v)).toBe(true);
        }
      }),
    );
  });

  it("always finds some neighbour, including one from the exact relative neighbourhood", () => {
    fc.assert(
      fc.property(fc.array(point, { minLength: 1, maxLength: 40 }), point, (points, [sx, sy]) => {
        const nodes = veinNodesAt(points);
        const triangulation = triangulateVeinNodes(nodes, bounds);
        const neighbours = delaunayNeighbours(triangulation, sx, sy);
        const exact = exactRelativeNeighbourhood(nodes, sx, sy);
        expect(neighbours.length).toBeGreaterThan(0);
        expect(exact.some((v) => neighbours.includes(v))).toBe(true);
      }),
    );
  });

  it("finds both nodes on either side of a source (the configuration that closes loops)", () => {
    const nodes = veinNodesAt([
      [10, 25],
      [40, 25],
      [12, 5],
    ]);
    const triangulation = triangulateVeinNodes(nodes, bounds);
    expect(urquhartNeighbourhood(triangulation, 25, 26)).toEqual([0, 1]);
    expect(exactRelativeNeighbourhood(nodes, 25, 26)).toEqual([0, 1]);
  });

  it("excludes a node hidden behind a closer one", () => {
    const nodes = veinNodesAt([
      [20, 25],
      [10, 25],
    ]);
    const triangulation = triangulateVeinNodes(nodes, bounds);
    expect(urquhartNeighbourhood(triangulation, 30, 25)).toEqual([0]);
  });
});
