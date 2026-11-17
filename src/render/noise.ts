/**
 * Deterministic noise for textures and hand-drawn effects, so a leaf looks the
 * same every time it is redrawn. Not used by the simulation.
 */

/** A pseudo-random number in [0, 1) for each integer lattice point. */
export const hash2 = (i: number, j: number, seed = 0): number => {
  let h =
    Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/** Smooth value noise in [0, 1), varying on a scale of about one unit. */
export const valueNoise = (x: number, y: number, seed = 0): number => {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const u = smoothstep(x - i);
  const v = smoothstep(y - j);
  const a = hash2(i, j, seed);
  const b = hash2(i + 1, j, seed);
  const c = hash2(i, j + 1, seed);
  const d = hash2(i + 1, j + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

/** Several octaves of value noise, in [0, 1). */
export const fractalNoise = (x: number, y: number, octaves = 4, seed = 0): number => {
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let range = 0;
  for (let o = 0; o < octaves; o++) {
    total += amplitude * valueNoise(x * frequency, y * frequency, seed + o * 101);
    range += amplitude;
    amplitude /= 2;
    frequency *= 2;
  }
  return total / range;
};

/** A seeded generator of numbers in [0, 1), for scattering marks such as stipple dots. */
export const scatter = (seed: number): (() => number) => {
  let n = 0;
  return () => hash2(n++, seed, 7919);
};

/**
 * Fractal noise that tiles seamlessly with the given period, by blending the
 * noise with copies of itself shifted by one period in each direction.
 */
export const tileableNoise = (
  x: number,
  y: number,
  width: number,
  height: number,
  scale: number,
  octaves = 4,
  seed = 0,
): number => {
  const f = (px: number, py: number) => fractalNoise(px / scale, py / scale, octaves, seed);
  const wx = x / width;
  const wy = y / height;
  return (
    f(x, y) * (1 - wx) * (1 - wy) +
    f(x - width, y) * wx * (1 - wy) +
    f(x, y - height) * (1 - wx) * wy +
    f(x - width, y - height) * wx * wy
  );
};

/**
 * Cellular (Worley) noise that tiles seamlessly over `width` by `height`, with
 * one jittered site per `size` square: the distances from (x, y) to the nearest
 * site (`f1`) and the second nearest (`f2`). Cell walls lie where the two are
 * close.
 */
export const tileableCells = (
  x: number,
  y: number,
  width: number,
  height: number,
  size: number,
  seed = 0,
): { f1: number; f2: number } => {
  const columns = width / size;
  const rows = height / size;
  const [ci, cj] = [Math.floor(x / size), Math.floor(y / size)];
  let f1 = Infinity;
  let f2 = Infinity;
  for (let dj = -2; dj <= 2; dj++) {
    for (let di = -2; di <= 2; di++) {
      const [i, j] = [ci + di, cj + dj];
      const wi = ((i % columns) + columns) % columns;
      const wj = ((j % rows) + rows) % rows;
      const d = Math.hypot(
        (i + hash2(wi, wj, seed)) * size - x,
        (j + hash2(wi, wj, seed + 1)) * size - y,
      );
      if (d < f1) [f1, f2] = [d, f1];
      else if (d < f2) f2 = d;
    }
  }
  return { f1, f2 };
};
