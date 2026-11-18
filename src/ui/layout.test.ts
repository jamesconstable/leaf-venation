import { describe, expect, it } from "vitest";
import { leafFrame, stageCentre } from "./layout";

describe("stageCentre", () => {
  it("is the middle of a narrow screen, where the panel doesn't float beside the leaf", () => {
    expect(stageCentre(600)).toBe(0.5);
  });

  it("moves right of the middle on a wide screen, to the middle of the space beside the panel", () => {
    const { left, width } = leafFrame(1200, 800);
    expect(stageCentre(1200)).toBeCloseTo((left + width / 2) / 1200);
    expect(stageCentre(1200)).toBeGreaterThan(0.5);
  });
});
