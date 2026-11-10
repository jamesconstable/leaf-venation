import type { Vec2 } from "../geometry/vector";

/** A point on a vein's centre line, with the vein's half width there. */
export interface RibbonPoint {
  readonly x: number;
  readonly y: number;
  readonly halfWidth: number;
}

/** The two edges of a ribbon, both running from its start to its end. */
export interface Ribbon {
  readonly left: readonly Vec2[];
  readonly right: readonly Vec2[];
}

/**
 * Samples a Catmull–Rom spline through the points, which passes through every
 * point and turns smoothly between them. Half widths are interpolated linearly.
 */
export const smoothCentreLine = (
  points: readonly RibbonPoint[],
  samplesPerSegment: number,
): RibbonPoint[] => {
  if (points.length < 3) return [...points];
  const at = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))] ?? points[0];
  const result: RibbonPoint[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    if (p0 === undefined || p1 === undefined || p2 === undefined || p3 === undefined) continue;
    for (let k = 0; k < samplesPerSegment; k++) {
      const t = k / samplesPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      const blend = (a: number, b: number, c: number, d: number) =>
        0.5 *
        (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      result.push({
        x: blend(p0.x, p1.x, p2.x, p3.x),
        y: blend(p0.y, p1.y, p2.y, p3.y),
        halfWidth: p1.halfWidth + (p2.halfWidth - p1.halfWidth) * t,
      });
    }
  }
  const last = points[points.length - 1];
  if (last !== undefined) result.push(last);
  return result;
};

/** Offsets a centre line by its half width on either side, perpendicular to its direction. */
export const ribbon = (centre: readonly RibbonPoint[]): Ribbon => {
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  centre.forEach((point, i) => {
    const before = centre[Math.max(0, i - 1)] ?? point;
    const after = centre[Math.min(centre.length - 1, i + 1)] ?? point;
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    left.push({ x: point.x + nx * point.halfWidth, y: point.y + ny * point.halfWidth });
    right.push({ x: point.x - nx * point.halfWidth, y: point.y - ny * point.halfWidth });
  });
  return { left, right };
};

/** Adds a ribbon to a path as one closed shape. */
export const traceRibbon = (path: Path2D | CanvasRenderingContext2D, { left, right }: Ribbon) => {
  left.forEach(({ x, y }, i) => {
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  });
  for (let i = right.length - 1; i >= 0; i--) {
    const point = right[i];
    if (point !== undefined) path.lineTo(point.x, point.y);
  }
  path.closePath();
};
