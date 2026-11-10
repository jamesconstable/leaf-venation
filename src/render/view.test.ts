import { describe, expect, it } from "vitest";
import { fitView, toScreenX, toScreenY } from "./view";

describe("fitView", () => {
  const bounds = { minX: -1, minY: 0, maxX: 1, maxY: 4 };

  it("centres the bounds in the canvas", () => {
    const view = fitView(bounds, 200, 100, 0);
    expect(toScreenX(view, 0)).toBe(100);
    expect(toScreenY(view, 2)).toBe(50);
  });

  it("puts larger y higher on screen", () => {
    const view = fitView(bounds, 200, 100, 0);
    expect(toScreenY(view, 4)).toBeLessThan(toScreenY(view, 0));
  });

  it("fits the limiting dimension exactly, less padding", () => {
    const view = fitView(bounds, 200, 100, 0.1);
    expect(toScreenY(view, 0) - toScreenY(view, 4)).toBeCloseTo(80);
  });
});
