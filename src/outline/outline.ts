import { region, type Polygon, type Region } from "../geometry/region";
import { vec2, type Vec2 } from "../geometry/vector";

/**
 * A chain of cubic Bézier segments: a start point followed by three points per
 * segment (two control points, then the segment's end point).
 */
export type BezierPath = readonly Vec2[];

/**
 * The definition of a leaf outline in normalised coordinates: the base at the
 * origin and the tip on the positive y axis at distance about 1.
 */
export interface LeafOutline {
  /**
   * The margin. For a symmetric outline, only the right half, running from the
   * base to the tip; it is mirrored to complete the shape. Otherwise the whole
   * closed margin, starting and ending at the same point.
   */
  readonly margin: BezierPath;
  readonly symmetric: boolean;
  /** Closed paths enclosing holes in the blade. */
  readonly fenestrations: readonly BezierPath[];
  readonly initialVeinNodes: readonly Vec2[];
}

const SAMPLES_PER_SEGMENT = 24;

/** Samples a Bézier path into a polyline, including both end points. */
export const flattenBezierPath = (path: BezierPath, samplesPerSegment = SAMPLES_PER_SEGMENT) => {
  const [start] = path;
  if (start === undefined) return [];
  const points: Vec2[] = [start];
  for (let i = 0; i + 3 < path.length; i += 3) {
    const [p0, p1, p2, p3] = [path[i], path[i + 1], path[i + 2], path[i + 3]];
    if (p0 === undefined || p1 === undefined || p2 === undefined || p3 === undefined) break;
    for (let k = 1; k <= samplesPerSegment; k++) {
      const t = k / samplesPerSegment;
      const u = 1 - t;
      const [a, b, c, d] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
      points.push(
        vec2(a * p0.x + b * p1.x + c * p2.x + d * p3.x, a * p0.y + b * p1.y + c * p2.y + d * p3.y),
      );
    }
  }
  return points;
};

/** Mirrors a right-half polyline (base to tip) to make a closed polygon. */
const mirrorHalf = (half: readonly Vec2[]): Polygon => {
  const mirrored = half
    .slice(1, -1)
    .reverse()
    .map(({ x, y }) => vec2(-x, y));
  return [...half, ...mirrored];
};

/** Drops a closing point that repeats the first. */
const open = (points: readonly Vec2[]): Polygon => {
  const first = points[0];
  const last = points[points.length - 1];
  const closed = first !== undefined && first.x === last?.x && first.y === last.y;
  return closed ? points.slice(0, -1) : points;
};

/** The blade described by an outline, at leaf length 1. */
export const outlineRegion = (outline: LeafOutline): Region => {
  const margin = flattenBezierPath(outline.margin);
  return region(
    outline.symmetric ? mirrorHalf(margin) : open(margin),
    outline.fenestrations.map((path) => open(flattenBezierPath(path))),
  );
};
