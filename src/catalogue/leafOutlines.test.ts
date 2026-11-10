import { describe, expect, it } from "vitest";
import { regionContains } from "../geometry/region";
import { outlineRegion } from "../outline/outline";
import { isStarShapedFrom } from "../outline/starShaped";
import { leafOutlines } from "./leafOutlines";

describe.each(leafOutlines)("leaf outline $id", ({ outline }) => {
  const blade = outlineRegion(outline);

  it("contains its initial vein nodes", () => {
    for (const { x, y } of outline.initialVeinNodes) {
      expect(regionContains(blade, x, y)).toBe(true);
    }
  });

  it("reaches its tip at y = 1", () => {
    expect(blade.bounds.maxY).toBeCloseTo(1, 9);
  });

  it("has a plausible leaf-like area", () => {
    expect(blade.area).toBeGreaterThan(0.2);
    expect(blade.area).toBeLessThan(1);
  });
});

it("gives every leaf outline a unique id", () => {
  const ids = leafOutlines.map(({ id }) => id);
  expect(new Set(ids).size).toBe(ids.length);
});

it("lists which leaf outlines allow marginal growth", () => {
  const starShaped = Object.fromEntries(
    leafOutlines.map(({ id, outline }) => [id, isStarShapedFrom(outlineRegion(outline))]),
  );
  expect(starShaped).toMatchInlineSnapshot(`
    {
      "cordate": true,
      "elliptic": true,
      "ovate": true,
    }
  `);
});
