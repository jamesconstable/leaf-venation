import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { region, regionContains } from "../geometry/region";
import { distance, vec2 } from "../geometry/vector";
import {
  initialState,
  simulationConfig,
  step,
  veinScale,
  type Growth,
  type SimulationState,
  type Venation,
  type VenationParameters,
} from "./simulation";
import { veinNodeArrays } from "./veinNodes";

/** An ellipse of length 1 with its base at the origin, standing in for a leaf outline. */
const blade = region(
  Array.from({ length: 64 }, (_, i) => {
    const t = (2 * Math.PI * i) / 64;
    return vec2(0.3 * Math.sin(t), 0.5 - 0.5 * Math.cos(t));
  }),
);

const noGrowth: Growth = { type: "none" };

const parameters = (venation: Venation, growth: Growth): VenationParameters => ({
  venation,
  killDistance: venation === "open" ? 0.04 : 0.01,
  birthDistance: 0.05,
  dartDensity: 300,
  growth,
});

const startState = (
  venation: Venation,
  randomSeed: string,
  detail = 60,
  growth: Growth = noGrowth,
) =>
  initialState(
    simulationConfig({
      blade,
      initialVeinNodes: [vec2(0, 0.01)],
      parameters: parameters(venation, growth),
      detail,
      randomSeed,
    }),
  );

const simulate = (
  venation: Venation,
  randomSeed: string,
  detail = 60,
  maxSteps = 2000,
  growth: Growth = noGrowth,
) => {
  let state = startState(venation, randomSeed, detail, growth);
  while (state.status === "growing" && state.stepCount < maxSteps) state = step(state);
  return state;
};

/** FNV-1a over the raw bytes of the vein graph and auxin sources. */
const fingerprint = (state: SimulationState): string => {
  const { xs, ys, parents } = veinNodeArrays(state.veinNodes);
  const sources = new Float64Array(state.auxinSources.flatMap((s) => [s.x, s.y]));
  const anastomoses = new Int32Array(state.anastomoses.flat());
  let hash = 0x811c9dc5;
  for (const array of [xs, ys, parents, sources, anastomoses]) {
    for (const byte of new Uint8Array(array.buffer, array.byteOffset, array.byteLength)) {
      hash = Math.imul(hash ^ byte, 0x01000193);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const venations: readonly Venation[] = ["open", "closed"];
const randomSeed = fc.string({ minLength: 1, maxLength: 8 });
const propertyOptions = { numRuns: 15 };

describe.each(venations)("%s venation", (venation) => {
  it("finishes, having grown veins", () => {
    const state = simulate(venation, "finish");
    expect(state.status).toBe("settled");
    expect(state.veinNodes.count).toBeGreaterThan(50);
  });

  it("is deterministic for a given random seed", () => {
    fc.assert(
      fc.property(randomSeed, (seed) => {
        expect(fingerprint(simulate(venation, seed, 30))).toBe(
          fingerprint(simulate(venation, seed, 30)),
        );
      }),
      propertyOptions,
    );
  });

  it("keeps every vein node inside the blade", () => {
    fc.assert(
      fc.property(randomSeed, (seed) => {
        const state = simulate(venation, seed, 40);
        const { xs, ys } = veinNodeArrays(state.veinNodes);
        xs.forEach((x, i) => {
          expect(regionContains(state.config.blade, x, ys[i] ?? NaN)).toBe(true);
        });
      }),
      propertyOptions,
    );
  });

  it("grows each vein node one vein segment length from its parent", () => {
    fc.assert(
      fc.property(randomSeed, (seed) => {
        const state = simulate(venation, seed, 40);
        const { xs, ys, parents } = veinNodeArrays(state.veinNodes);
        parents.forEach((parent, i) => {
          if (parent === -1) return;
          expect(parent).toBeLessThan(i);
          expect(
            distance(xs[i] ?? NaN, ys[i] ?? NaN, xs[parent] ?? NaN, ys[parent] ?? NaN),
          ).toBeCloseTo(1, 9);
        });
      }),
      propertyOptions,
    );
  });

  it("keeps auxin sources at least the birth distance apart, at every step", () => {
    fc.assert(
      fc.property(randomSeed, (seed) => {
        let state = initialState(simulate(venation, seed, 40, 0).config);
        for (let i = 0; i < 60 && state.status === "growing"; i++) {
          state = step(state);
          const sources = state.auxinSources;
          // One assertion per step on the closest pair: an assertion per pair is slow.
          let closest = Infinity;
          for (let a = 0; a < sources.length; a++) {
            for (let b = a + 1; b < sources.length; b++) {
              const [sa, sb] = [sources[a], sources[b]];
              if (sa === undefined || sb === undefined) continue;
              closest = Math.min(closest, distance(sa.x, sa.y, sb.x, sb.y));
            }
          }
          expect(closest).toBeGreaterThanOrEqual(state.config.birthDistance);
        }
      }),
      propertyOptions,
    );
  });

  it("settles with every auxin source reached (no deadlocked sources)", () => {
    fc.assert(
      fc.property(randomSeed, (seed) => {
        const state = simulate(venation, seed, 60);
        expect(state.status).toBe("settled");
        expect(state.auxinSources).toEqual([]);
      }),
      propertyOptions,
    );
  });

  it("stops at the node budget", () => {
    const config = { ...simulate(venation, "budget", 60, 0).config, nodeBudget: 200 };
    let state = initialState(config);
    while (state.status === "growing") state = step(state);
    expect(state.status).toBe("budgetReached");
    expect(state.veinNodes.count).toBe(200);
  });
});

const marginal: Growth = { type: "marginal", initialSize: 0.3, growthPerStep: 0.01 };
const isogonic: Growth = { type: "isogonic", initialSize: 0.3, growthPerStep: 0.01 };
const growths = [marginal, isogonic];

describe.each(growths.flatMap((growth) => venations.map((venation) => ({ growth, venation }))))(
  "$growth.type growth, $venation venation",
  ({ growth, venation }) => {
    it("grows the leaf linearly to full size, and only then settles", () => {
      let state = startState(venation, "grow", 60, growth);
      expect(state.size).toBe(0.3);
      while (state.status === "growing") {
        const before = state.size;
        state = step(state);
        expect(state.size).toBeCloseTo(Math.min(1, before + 0.01), 12);
        if (state.status === "settled") expect(before).toBe(1);
      }
      expect(state.status).toBe("settled");
      expect(state.veinNodes.count).toBeGreaterThan(50);
    });

    it("keeps every vein node inside the blade as it grows", () => {
      fc.assert(
        fc.property(randomSeed, (seed) => {
          let state = startState(venation, seed, 40, growth);
          while (state.status === "growing") {
            state = step(state);
            if (state.stepCount % 10 !== 0 && state.status === "growing") continue;
            const { xs, ys } = veinNodeArrays(state.veinNodes);
            const inward = growth.type === "marginal" ? state.size : 1;
            xs.forEach((x, i) => {
              expect(regionContains(state.config.blade, x / inward, (ys[i] ?? NaN) / inward)).toBe(
                true,
              );
            });
          }
        }),
        propertyOptions,
      );
    });

    it("grows each new vein node one vein segment length (at the current size) from its parent", () => {
      let state = startState(venation, "segments", 40, growth);
      const createdAtScale: number[] = [];
      while (state.status === "growing") {
        state = step(state);
        while (createdAtScale.length < state.veinNodes.count) createdAtScale.push(veinScale(state));
      }
      const { xs, ys, parents } = veinNodeArrays(state.veinNodes);
      parents.forEach((parent, i) => {
        if (parent === -1) return;
        const length = distance(xs[i] ?? NaN, ys[i] ?? NaN, xs[parent] ?? NaN, ys[parent] ?? NaN);
        expect(length * (createdAtScale[i] ?? NaN)).toBeCloseTo(1, 9);
      });
    });
  },
);

describe("anastomoses", () => {
  it("never occur in open venation", () => {
    fc.assert(
      fc.property(randomSeed, (seed) => {
        expect(simulate("open", seed, 40).anastomoses).toEqual([]);
      }),
      propertyOptions,
    );
  });

  it("close loops in closed venation", () => {
    expect(simulate("closed", "loops").anastomoses.length).toBeGreaterThan(5);
  });

  it("join distinct, non-adjacent vein nodes that are close together", () => {
    fc.assert(
      fc.property(randomSeed, (seed) => {
        const state = simulate("closed", seed, 60);
        const { xs, ys, parents } = veinNodeArrays(state.veinNodes);
        const keys = state.anastomoses.map(([a, b]) => `${a},${b}`);
        expect(new Set(keys).size).toBe(keys.length);
        for (const [a, b] of state.anastomoses) {
          expect(a).toBeLessThan(b);
          expect(b).toBeLessThan(state.veinNodes.count);
          expect(parents[a] === b || parents[b] === a).toBe(false);
          const length = distance(xs[a] ?? NaN, ys[a] ?? NaN, xs[b] ?? NaN, ys[b] ?? NaN);
          expect(length).toBeLessThanOrEqual(2 * state.config.killDistance + 2);
        }
      }),
      propertyOptions,
    );
  });
});

describe("simulation", () => {
  it("leaves the state it was given unchanged", () => {
    const before = simulate("closed", "pure", 60, 40);
    const fingerprintBefore = fingerprint(before);
    step(before);
    step(before);
    expect(fingerprint(before)).toBe(fingerprintBefore);
  });

  it("reproduces a known result exactly (golden test; see ADR 0002)", () => {
    // If this fails, the change altered simulation results. Either undo it, or
    // accept it deliberately: update these fingerprints and bump MODEL_VERSION
    // (unless that version has never been released).
    const golden = (venation: Venation, growth: Growth = noGrowth) =>
      fingerprint(simulate(venation, "golden", 60, 2000, growth));
    expect({
      open: golden("open"),
      closed: golden("closed"),
      openMarginal: golden("open", marginal),
      closedIsogonic: golden("closed", isogonic),
    }).toMatchInlineSnapshot(`
      {
        "closed": "70590241",
        "closedIsogonic": "004e6351",
        "open": "f57d16d3",
        "openMarginal": "000a3763",
      }
    `);
  });
});
