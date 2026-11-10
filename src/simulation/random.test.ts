import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { random, randomStateFromSeed } from "./random";

const take = (seed: string, n: number) => {
  const rng = random(randomStateFromSeed(seed));
  return Array.from({ length: n }, () => rng.next());
};

describe("random", () => {
  it("produces the same sequence for the same random seed", () => {
    fc.assert(
      fc.property(fc.string(), (seed) => {
        expect(take(seed, 20)).toEqual(take(seed, 20));
      }),
    );
  });

  it("produces different sequences for different random seeds", () => {
    expect(take("a", 5)).not.toEqual(take("b", 5));
  });

  it("produces numbers in [0, 1)", () => {
    for (const value of take("range", 10_000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("resumes exactly from a saved state", () => {
    const rng = random(randomStateFromSeed("resume"));
    rng.next();
    const resumed = random(rng.state());
    expect([resumed.next(), resumed.next()]).toEqual([rng.next(), rng.next()]);
  });

  it("matches the known sequence (guards against accidental changes; see ADR 0002)", () => {
    expect(take("leaf", 3)).toMatchInlineSnapshot(`
      [
        0.2564188288524747,
        0.9986536228097975,
        0.6172636994160712,
      ]
    `);
  });
});
