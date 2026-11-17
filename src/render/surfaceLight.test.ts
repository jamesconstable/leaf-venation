import { describe, expect, it } from "vitest";
import { lightFrom, reflect } from "./surfaceLight";

const upperRight = lightFrom({ x: 0.6, y: -0.8 }, Math.PI / 4);

describe("lightFrom", () => {
  it("points toward the light, raised by the elevation", () => {
    expect(Math.hypot(upperRight.x, upperRight.y, upperRight.z)).toBeCloseTo(1);
    expect(upperRight.x).toBeGreaterThan(0);
    expect(upperRight.y).toBeLessThan(0);
    expect(upperRight.z).toBeCloseTo(Math.SQRT1_2);
  });
});

describe("reflect", () => {
  it("lights a flat surface by the light's elevation", () => {
    expect(reflect(0, 0, upperRight, 20).diffuse).toBeCloseTo(Math.SQRT1_2);
  });

  it("is brighter where the surface faces the light", () => {
    // Height falls toward the lower left, so the surface tilts toward the upper right.
    const facing = reflect(-0.6, 0.8, upperRight, 20);
    const away = reflect(0.6, -0.8, upperRight, 20);
    expect(facing.diffuse).toBeGreaterThan(reflect(0, 0, upperRight, 20).diffuse);
    expect(away.diffuse).toBeLessThan(reflect(0, 0, upperRight, 20).diffuse);
  });

  it("peaks the highlight where the surface faces halfway between light and viewer", () => {
    // Facing the half vector: slopes chosen so the normal equals it.
    const { hx, hy, hz } = upperRight;
    const peak = reflect(-hx / hz, -hy / hz, upperRight, 20);
    expect(peak.specular).toBeCloseTo(1);
    expect(reflect(0, 0, upperRight, 20).specular).toBeLessThan(0.5);
  });

  it("gives no light to a surface turned fully away", () => {
    expect(reflect(50, -70, upperRight, 20)).toEqual({ diffuse: 0, specular: 0 });
  });
});
