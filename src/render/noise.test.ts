import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fractalNoise, hash2, scatter, tileableNoise, valueNoise } from "./noise";

const coordinate = fc.double({ min: -1000, max: 1000, noNaN: true });

describe("noise", () => {
  it("stays within [0, 1)", () => {
    fc.assert(
      fc.property(coordinate, coordinate, (x, y) => {
        for (const value of [valueNoise(x, y), fractalNoise(x, y), hash2(x, y)]) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThan(1);
        }
      }),
    );
  });

  it("is continuous: nearby points have similar values", () => {
    fc.assert(
      fc.property(coordinate, coordinate, (x, y) => {
        expect(Math.abs(valueNoise(x, y) - valueNoise(x + 1e-4, y))).toBeLessThan(0.01);
      }),
    );
  });

  it("matches the lattice hash at lattice points", () => {
    expect(valueNoise(3, 4)).toBe(hash2(3, 4));
  });

  it("scatters the same sequence for the same seed", () => {
    const a = scatter(5);
    const b = scatter(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe("tileableNoise", () => {
  it("matches across opposite edges, so a texture repeats without seams", () => {
    for (let k = 0; k <= 64; k += 8) {
      expect(tileableNoise(0, k, 64, 64, 9)).toBeCloseTo(tileableNoise(64, k, 64, 64, 9), 9);
      expect(tileableNoise(k, 0, 64, 64, 9)).toBeCloseTo(tileableNoise(k, 64, 64, 64, 9), 9);
    }
  });
});
