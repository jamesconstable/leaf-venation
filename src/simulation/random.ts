/**
 * Deterministic pseudo-random numbers (ADR 0002): sfc32, seeded by hashing the
 * random seed string with cyrb128. Both use only 32-bit integer operations, so
 * the sequence is identical in every browser.
 */

/** The complete state of the generator; a plain value that can be stored in simulation state. */
export type RandomState = readonly [number, number, number, number];

export const randomStateFromSeed = (randomSeed: string): RandomState => {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < randomSeed.length; i++) {
    const k = randomSeed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
};

/**
 * A mutable generator for use within a single simulation step. Start one from a
 * `RandomState` and store `state()` back into the simulation state afterwards.
 */
export interface Random {
  /** A uniformly distributed number in [0, 1). */
  next(): number;
  state(): RandomState;
}

export const random = (initial: RandomState): Random => {
  let [a, b, c, d] = initial;
  return {
    next() {
      const t = (((a + b) | 0) + d) | 0;
      d = (d + 1) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    },
    state: () => [a >>> 0, b >>> 0, c >>> 0, d >>> 0],
  };
};
