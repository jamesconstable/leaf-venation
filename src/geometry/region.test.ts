import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { polygonArea, region, regionContains, scaleRegion } from "./region";
import { vec2 } from "./vector";

const square = [vec2(0, 0), vec2(4, 0), vec2(4, 4), vec2(0, 4)];
const hole = [vec2(1, 1), vec2(3, 1), vec2(3, 3), vec2(1, 3)];

describe("region", () => {
  it("computes area regardless of winding", () => {
    expect(polygonArea(square)).toBe(16);
    expect(polygonArea([...square].reverse())).toBe(16);
  });

  it("subtracts holes from area", () => {
    expect(region(square, [hole]).area).toBe(12);
  });

  it("excludes points in holes and outside the outer polygon", () => {
    const r = region(square, [hole]);
    expect(regionContains(r, 0.5, 0.5)).toBe(true);
    expect(regionContains(r, 2, 2)).toBe(false);
    expect(regionContains(r, 5, 2)).toBe(false);
  });

  it("scales area by the square of the factor", () => {
    fc.assert(
      fc.property(fc.double({ min: 0.1, max: 100, noNaN: true }), (factor) => {
        const r = region(square, [hole]);
        expect(scaleRegion(r, factor).area).toBeCloseTo(r.area * factor * factor, 6);
      }),
    );
  });
});
