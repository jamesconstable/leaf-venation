import Delaunator from "delaunator";
import { distanceSquared } from "../geometry/vector";
import { nearestVeinNode, veinNodeX, veinNodeY, type VeinNodes } from "./veinNodes";

/**
 * Whether vein node `u` excludes vein node `v` from the relative neighbourhood of
 * the source at (sx, sy): `u` is closer to the source than `v` is, and closer to
 * `v` than the source is (Runions et al. 2005, Equation 2).
 */
const excludes = (nodes: VeinNodes, u: number, v: number, sx: number, sy: number): boolean => {
  const vs = distanceSquared(veinNodeX(nodes, v), veinNodeY(nodes, v), sx, sy);
  const us = distanceSquared(veinNodeX(nodes, u), veinNodeY(nodes, u), sx, sy);
  const uv = distanceSquared(
    veinNodeX(nodes, u),
    veinNodeY(nodes, u),
    veinNodeX(nodes, v),
    veinNodeY(nodes, v),
  );
  return Math.max(us, uv) < vs;
};

/**
 * The exact relative neighbourhood of a source among all vein nodes, by brute
 * force in O(n²). Too slow for real use; it is the oracle the faster
 * approximations are tested against.
 */
export const exactRelativeNeighbourhood = (nodes: VeinNodes, sx: number, sy: number): number[] => {
  const neighbourhood: number[] = [];
  for (let v = 0; v < nodes.count; v++) {
    let excluded = false;
    for (let u = 0; u < nodes.count && !excluded; u++) {
      excluded = u !== v && excludes(nodes, u, v, sx, sy);
    }
    if (!excluded) neighbourhood.push(v);
  }
  return neighbourhood;
};

/**
 * A Delaunay triangulation of the vein nodes, built once per step and shared by
 * every source's neighbourhood query. Four distant "ghost" corners enclose the
 * vein nodes, so every source lies inside the triangulation and even one or two
 * vein nodes can be triangulated. Ghost vertices are never reported as neighbours.
 */
export interface VeinTriangulation {
  readonly nodes: VeinNodes;
  readonly delaunay: Delaunator<ArrayLike<number>>;
  /** For each vertex, one halfedge that ends at it. */
  readonly incoming: Int32Array;
}

export const triangulateVeinNodes = (
  nodes: VeinNodes,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): VeinTriangulation => {
  const n = nodes.count;
  const coords = new Float64Array(2 * (n + 4));
  for (let i = 0; i < n; i++) {
    coords[2 * i] = veinNodeX(nodes, i);
    coords[2 * i + 1] = veinNodeY(nodes, i);
  }
  const margin = 10 * Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 1);
  const ghosts = [
    [bounds.minX - margin, bounds.minY - margin],
    [bounds.maxX + margin, bounds.minY - margin],
    [bounds.maxX + margin, bounds.maxY + margin],
    [bounds.minX - margin, bounds.maxY + margin],
  ] as const;
  ghosts.forEach(([x, y], k) => {
    coords[2 * (n + k)] = x;
    coords[2 * (n + k) + 1] = y;
  });
  const delaunay = new Delaunator(coords);
  const incoming = new Int32Array(n + 4).fill(-1);
  for (let e = 0; e < delaunay.triangles.length; e++) {
    const end = delaunay.triangles[nextHalfedge(e)] ?? -1;
    if (end >= 0 && incoming[end] === -1) incoming[end] = e;
  }
  return { nodes, delaunay, incoming };
};

const nextHalfedge = (e: number): number => (e % 3 === 2 ? e - 2 : e + 1);

/**
 * Vein nodes adjacent to a source in the Delaunay triangulation of the vein
 * nodes plus that source, found without inserting the source: they are the
 * vertices of the triangles whose circumcircles contain it (the Bowyer–Watson
 * cavity). The cavity always includes a triangle around the nearest vein node,
 * so the search starts there and spreads to adjacent triangles.
 */
export const delaunayNeighbours = (
  triangulation: VeinTriangulation,
  sx: number,
  sy: number,
): number[] => {
  const { nodes, delaunay, incoming } = triangulation;
  const { triangles, halfedges, coords } = delaunay;
  const nearest = nearestVeinNode(nodes, sx, sy);
  if (nearest === -1) return [];

  const containsSource = (t: number): boolean => {
    const vertex = (k: number) => triangles[3 * t + k] ?? 0;
    const [a, b, c] = [vertex(0), vertex(1), vertex(2)];
    const at = (v: number, axis: 0 | 1) => coords[2 * v + axis] ?? NaN;
    const [adx, ady] = [at(a, 0) - sx, at(a, 1) - sy];
    const [bdx, bdy] = [at(b, 0) - sx, at(b, 1) - sy];
    const [cdx, cdy] = [at(c, 0) - sx, at(c, 1) - sy];
    const det =
      (adx * adx + ady * ady) * (bdx * cdy - cdx * bdy) -
      (bdx * bdx + bdy * bdy) * (adx * cdy - cdx * ady) +
      (cdx * cdx + cdy * cdy) * (adx * bdy - bdx * ady);
    const orientation = (bdx - adx) * (cdy - ady) - (bdy - ady) * (cdx - adx);
    return det * orientation > 0;
  };

  const visited = new Set<number>();
  const pending: number[] = [];
  const start = incoming[nearest] ?? -1;
  let e = start;
  do {
    const t = Math.floor(e / 3);
    if (!visited.has(t)) {
      visited.add(t);
      if (containsSource(t)) pending.push(t);
    }
    e = halfedges[nextHalfedge(e)] ?? -1;
  } while (e !== -1 && e !== start);

  const cavity = new Set<number>(pending);
  while (pending.length > 0) {
    const t = pending.pop() ?? 0;
    for (let k = 0; k < 3; k++) {
      const opposite = halfedges[3 * t + k] ?? -1;
      if (opposite === -1) continue;
      const neighbour = Math.floor(opposite / 3);
      if (visited.has(neighbour)) continue;
      visited.add(neighbour);
      if (containsSource(neighbour)) {
        cavity.add(neighbour);
        pending.push(neighbour);
      }
    }
  }

  const neighbours = new Set<number>();
  for (const t of cavity) {
    for (let k = 0; k < 3; k++) {
      const v = triangles[3 * t + k] ?? -1;
      if (v >= 0 && v < nodes.count) neighbours.add(v);
    }
  }
  // Floating-point trouble can leave the cavity empty; the nearest node is always a neighbour.
  if (neighbours.size === 0) neighbours.add(nearest);
  return [...neighbours].sort((a, b) => a - b);
};

/**
 * Urquhart's approximation of a source's relative neighbourhood: its Delaunay
 * neighbours, minus any excluded by another Delaunay neighbour (Runions et al.
 * 2005, Section 5.2). Always a superset of the exact relative neighbourhood.
 */
export const urquhartNeighbourhood = (
  triangulation: VeinTriangulation,
  sx: number,
  sy: number,
): number[] => {
  const candidates = delaunayNeighbours(triangulation, sx, sy);
  const { nodes } = triangulation;
  return candidates.filter(
    (v) => !candidates.some((u) => u !== v && excludes(nodes, u, v, sx, sy)),
  );
};
