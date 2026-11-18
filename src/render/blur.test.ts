import { describe, expect, it } from "vitest";
import { blurField, boxBlur } from "./blur";

const image = (width: number, height: number, value: (x: number, y: number) => number) => {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++)
      pixels.fill(value(x, y), 4 * (y * width + x), 4 * (y * width + x) + 4);
  }
  return pixels;
};

describe("boxBlur", () => {
  it("leaves a flat image unchanged", () => {
    const pixels = image(10, 8, () => 120);
    boxBlur(pixels, 10, 8, 3);
    expect([...new Set(pixels)]).toEqual([120]);
  });

  it("spreads a bright point into its neighbourhood, symmetrically", () => {
    const pixels = image(21, 21, (x, y) => (x === 10 && y === 10 ? 255 : 0));
    boxBlur(pixels, 21, 21, 2);
    const at = (x: number, y: number) => pixels[4 * (y * 21 + x)] ?? -1;
    expect(at(10, 10)).toBeLessThan(255);
    expect(at(12, 10)).toBeGreaterThan(0);
    expect(at(8, 10)).toBe(at(12, 10));
    expect(at(10, 8)).toBe(at(10, 12));
    expect(at(0, 0)).toBe(0);
  });

  it("does nothing with a zero radius", () => {
    const pixels = image(4, 4, (x) => x * 50);
    const before = [...pixels];
    boxBlur(pixels, 4, 4, 0);
    expect([...pixels]).toEqual(before);
  });
});

describe("blurField", () => {
  it("keeps the total and spreads a point symmetrically", () => {
    const values = new Float32Array(21 * 21);
    values[10 * 21 + 10] = 1;
    blurField(values, 21, 21, 2);
    const total = values.reduce((sum, v) => sum + v, 0);
    expect(total).toBeCloseTo(1, 5);
    expect(values[10 * 21 + 12]).toBeCloseTo(values[10 * 21 + 8] ?? -1, 6);
    expect(values[12 * 21 + 10]).toBeCloseTo(values[8 * 21 + 10] ?? -1, 6);
  });
});
