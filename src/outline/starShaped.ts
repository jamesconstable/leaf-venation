import { regionContains, type Region } from "../geometry/region";
import { vec2, type Vec2 } from "../geometry/vector";

const orientation = (a: Vec2, b: Vec2, c: Vec2): number =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

/** Whether segments ab and cd cross at a single point strictly inside both. */
const crossProperly = (a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean =>
  orientation(a, b, c) * orientation(a, b, d) < 0 &&
  orientation(c, d, a) * orientation(c, d, b) < 0;

const edges = (polygon: readonly Vec2[]): [Vec2, Vec2][] =>
  polygon.flatMap((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return b === undefined ? [] : [[a, b] as [Vec2, Vec2]];
  });

/** Squared distance from p to segment ab. */
const distanceToSegmentSquared = (p: Vec2, a: Vec2, b: Vec2): number => {
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  const [ex, ey] = [p.x - (a.x + t * dx), p.y - (a.y + t * dy)];
  return ex * ex + ey * ey;
};

/**
 * Whether every point of the region can be seen from `centre` along a straight
 * line that stays inside it. For a blade and its base, this is exactly the
 * condition for marginal growth to work: scaling the blade about its base then
 * produces blades that each contain all the smaller ones, so veins laid down
 * early never end up outside the leaf. Any fenestration breaks it.
 *
 * Checked at every polygon vertex: the line to it must not cross an edge, and
 * points along it must lie inside the region or on its margin.
 */
export const isStarShapedFrom = (region: Region, centre: Vec2 = vec2(0, 0)): boolean => {
  if (region.holes.length > 0) return false;
  const boundary = edges(region.outer);
  const { minX, minY, maxX, maxY } = region.bounds;
  const tolerance = 1e-9 * Math.max(maxX - minX, maxY - minY);
  const insideOrOnMargin = (p: Vec2) =>
    regionContains(region, p.x, p.y) ||
    boundary.some(([a, b]) => distanceToSegmentSquared(p, a, b) <= tolerance * tolerance);
  return region.outer.every((vertex) => {
    if (boundary.some(([a, b]) => crossProperly(centre, vertex, a, b))) return false;
    return [0.25, 0.5, 0.75].every((t) =>
      insideOrOnMargin(
        vec2(centre.x + t * (vertex.x - centre.x), centre.y + t * (vertex.y - centre.y)),
      ),
    );
  });
};
