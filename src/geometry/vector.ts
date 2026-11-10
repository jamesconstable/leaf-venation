/** An immutable point or vector in the plane. */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const vec2 = (x: number, y: number): Vec2 => ({ x, y });

/**
 * Squared Euclidean distance. Prefer this over `distance` when only comparing.
 *
 * Simulation code uses only `+ - * /` and `Math.sqrt`, which IEEE 754 requires to be
 * correctly rounded, so results are identical in every browser (see ADR 0002).
 * `Math.hypot` and trigonometric functions carry no such guarantee.
 */
export const distanceSquared = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
};

export const distance = (ax: number, ay: number, bx: number, by: number): number =>
  Math.sqrt(distanceSquared(ax, ay, bx, by));
