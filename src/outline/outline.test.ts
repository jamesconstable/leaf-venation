import { describe, expect, it } from "vitest";
import { regionContains } from "../geometry/region";
import { vec2 } from "../geometry/vector";
import { flattenBezierPath, outlineRegion, type LeafOutline } from "./outline";

/** A straight-sided right half: base (0, 0) → (0.5, 0.5) → tip (0, 1). */
const diamondHalf = [
  vec2(0, 0),
  vec2(0.5 / 3, 0.5 / 3),
  vec2(1 / 3, 1 / 3),
  vec2(0.5, 0.5),
  vec2(1 / 3, 2 / 3),
  vec2(0.5 / 3, 2.5 / 3),
  vec2(0, 1),
];

const diamond: LeafOutline = {
  margin: diamondHalf,
  symmetric: true,
  fenestrations: [],
  initialVeinNodes: [vec2(0, 0.01)],
};

describe("outline", () => {
  it("samples each segment and includes both end points", () => {
    const points = flattenBezierPath(diamondHalf, 4);
    expect(points).toHaveLength(9);
    expect(points[0]).toEqual(vec2(0, 0));
    expect(points[8]?.x).toBeCloseTo(0, 12);
    expect(points[8]?.y).toBeCloseTo(1, 12);
  });

  it("mirrors a symmetric half into a whole blade", () => {
    const blade = outlineRegion(diamond);
    expect(blade.area).toBeCloseTo(0.5, 9);
    expect(regionContains(blade, -0.2, 0.5)).toBe(true);
    expect(regionContains(blade, 0.2, 0.5)).toBe(true);
  });

  it("cuts fenestrations out of the blade", () => {
    const square = (cx: number, cy: number, r: number) => [
      vec2(cx - r, cy - r),
      vec2(cx - r, cy - r),
      vec2(cx + r, cy - r),
      vec2(cx + r, cy - r),
      vec2(cx + r, cy - r),
      vec2(cx + r, cy + r),
      vec2(cx + r, cy + r),
      vec2(cx + r, cy + r),
      vec2(cx - r, cy + r),
      vec2(cx - r, cy + r),
      vec2(cx - r, cy + r),
      vec2(cx - r, cy - r),
      vec2(cx - r, cy - r),
    ];
    const blade = outlineRegion({ ...diamond, fenestrations: [square(0, 0.5, 0.1)] });
    expect(blade.area).toBeCloseTo(0.5 - 0.04, 9);
    expect(regionContains(blade, 0, 0.5)).toBe(false);
  });
});
