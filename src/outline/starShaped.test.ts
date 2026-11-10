import { describe, expect, it } from "vitest";
import { region } from "../geometry/region";
import { vec2 } from "../geometry/vector";
import { isStarShapedFrom } from "./starShaped";

/** A polygon tracing a circle of radius 0.5 whose lowest point is the origin. */
const circle = Array.from({ length: 48 }, (_, i) => {
  const t = (2 * Math.PI * i) / 48;
  return vec2(0.5 * Math.sin(t), 0.5 - 0.5 * Math.cos(t));
});

describe("isStarShapedFrom", () => {
  it("accepts a convex blade seen from its base", () => {
    expect(isStarShapedFrom(region(circle))).toBe(true);
  });

  it("rejects a blade with a fenestration", () => {
    const hole = circle.map(({ x, y }) => vec2(0.1 * x, 0.5 + 0.1 * (y - 0.5)));
    expect(isStarShapedFrom(region(circle, [hole]))).toBe(false);
  });

  it("rejects a blade whose lobes curl back out of sight of the base", () => {
    // A U shape standing on its base: the tops of the arms hide behind the notch between them.
    const u = [
      vec2(0, 0),
      vec2(0.5, 0),
      vec2(0.5, 1),
      vec2(0.3, 1),
      vec2(0.3, 0.3),
      vec2(-0.3, 0.3),
      vec2(-0.3, 1),
      vec2(-0.5, 1),
      vec2(-0.5, 0),
    ];
    expect(isStarShapedFrom(region(u))).toBe(false);
  });

  it("accepts a heart shape seen from the notch at its base", () => {
    const heart = [
      vec2(0, 0),
      vec2(0.2, -0.1),
      vec2(0.4, 0.1),
      vec2(0, 1),
      vec2(-0.4, 0.1),
      vec2(-0.2, -0.1),
    ];
    expect(isStarShapedFrom(region(heart))).toBe(true);
  });
});
