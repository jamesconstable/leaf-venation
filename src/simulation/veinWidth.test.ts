import { describe, expect, it } from "vitest";
import { veinWidths } from "./veinWidth";

describe("veinWidths", () => {
  it("gives the finest veins width 1", () => {
    expect([...veinWidths([-1, 0, 1], 2)]).toEqual([1, 1, 1]);
  });

  it("combines children by Murray's law", () => {
    // 0 ← 1, 0 ← 2: two width-1 children make a parent of width 2^(1/n).
    const widths = veinWidths([-1, 0, 0], 3);
    expect(widths[0]).toBeCloseTo(2 ** (1 / 3));
  });

  it("accumulates through a chain of branches", () => {
    // 0 ← 1 ← {2, 3}; 0 ← 4. With n = 2: w1² = 2, w0² = 2 + 1 = 3.
    const widths = veinWidths([-1, 0, 1, 1, 0], 2);
    expect(widths[1]).toBeCloseTo(Math.sqrt(2));
    expect(widths[0]).toBeCloseTo(Math.sqrt(3));
  });
});
