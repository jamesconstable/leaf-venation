import type { Vec2 } from "./vector";

/** A closed polygon; the last point connects back to the first. */
export type Polygon = readonly Vec2[];

export interface BoundingBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** A polygonal area with optional holes, e.g. a blade with fenestrations. */
export interface Region {
  readonly outer: Polygon;
  readonly holes: readonly Polygon[];
  readonly bounds: BoundingBox;
  readonly area: number;
}

export const boundingBox = (polygon: Polygon): BoundingBox => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { x, y } of polygon) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
};

/** Unsigned area by the shoelace formula. */
export const polygonArea = (polygon: Polygon): number => {
  let twiceArea = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j];
    const b = polygon[i];
    if (a === undefined || b === undefined) continue;
    twiceArea += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twiceArea) / 2;
};

/** Even-odd ray casting test. Points exactly on an edge may be classified either way. */
export const polygonContains = (polygon: Polygon, x: number, y: number): boolean => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a === undefined || b === undefined) continue;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
};

export const region = (outer: Polygon, holes: readonly Polygon[] = []): Region => ({
  outer,
  holes,
  bounds: boundingBox(outer),
  area: polygonArea(outer) - holes.reduce((total, hole) => total + polygonArea(hole), 0),
});

export const regionContains = (r: Region, x: number, y: number): boolean => {
  const { minX, minY, maxX, maxY } = r.bounds;
  if (x < minX || x > maxX || y < minY || y > maxY) return false;
  return polygonContains(r.outer, x, y) && !r.holes.some((hole) => polygonContains(hole, x, y));
};

export const scalePolygon = (polygon: Polygon, factor: number): Polygon =>
  polygon.map(({ x, y }) => ({ x: x * factor, y: y * factor }));

export const scaleRegion = (r: Region, factor: number): Region =>
  region(
    scalePolygon(r.outer, factor),
    r.holes.map((hole) => scalePolygon(hole, factor)),
  );
