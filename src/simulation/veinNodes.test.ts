import { describe, expect, it } from "vitest";
import {
  appendVeinNodes,
  emptyVeinNodes,
  nearestVeinNode,
  veinNodeArrays,
  type VeinNodes,
} from "./veinNodes";

const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

const withNodes = (nodes: VeinNodes, points: readonly (readonly [number, number])[]) => {
  const appender = appendVeinNodes(nodes);
  for (const [x, y] of points) appender.append(x, y, appender.current().count - 1);
  return appender.finish();
};

describe("VeinNodes", () => {
  it("leaves earlier views unchanged when later views append", () => {
    const a = withNodes(emptyVeinNodes(bounds, 2), [[1, 1]]);
    const b = withNodes(a, [[9, 9]]);
    expect(a.count).toBe(1);
    expect(b.count).toBe(2);
    expect(nearestVeinNode(a, 9, 9)).toBe(0);
    expect(nearestVeinNode(b, 9, 9)).toBe(1);
  });

  it("branches off a copy when appending to a view that is no longer the latest", () => {
    const a = withNodes(emptyVeinNodes(bounds, 2), [[1, 1]]);
    const b = withNodes(a, [[9, 9]]);
    const c = withNodes(a, [[5, 5]]);
    expect(veinNodeArrays(b).xs).toEqual(new Float64Array([1, 9]));
    expect(veinNodeArrays(c).xs).toEqual(new Float64Array([1, 5]));
    expect(nearestVeinNode(b, 6, 6)).toBe(1);
    expect(nearestVeinNode(c, 9, 9)).toBe(1);
  });

  it("grows beyond its initial capacity", () => {
    const points = Array.from({ length: 200 }, (_, i) => [i / 20, i / 20] as const);
    const nodes = withNodes(emptyVeinNodes(bounds, 2), points);
    expect(nodes.count).toBe(200);
    expect(veinNodeArrays(nodes).parents[199]).toBe(198);
    expect(nearestVeinNode(nodes, 9.95, 9.95)).toBe(199);
  });
});
