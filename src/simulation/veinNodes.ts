import type { BoundingBox } from "../geometry/region";
import { SpatialGrid } from "./spatialGrid";

/**
 * Shared, growable storage behind one or more `VeinNodes` values. Vein nodes are
 * only ever appended, so every state's nodes are a prefix of the storage, and a
 * state taken earlier stays valid as later states append.
 */
interface Storage {
  xs: Float64Array;
  ys: Float64Array;
  parents: Int32Array;
  /** The number of nodes written; only a `VeinNodes` with this count may append in place. */
  length: number;
  grid: SpatialGrid;
  readonly bounds: BoundingBox;
  readonly cellSize: number;
}

/**
 * An immutable view of the vein graph: the first `count` nodes of the storage.
 * Each node's parent has a lower index (-1 for initial vein nodes), so the graph
 * is acyclic by construction.
 */
export interface VeinNodes {
  readonly storage: Storage;
  readonly count: number;
}

export const emptyVeinNodes = (bounds: BoundingBox, cellSize: number): VeinNodes => ({
  storage: {
    xs: new Float64Array(64),
    ys: new Float64Array(64),
    parents: new Int32Array(64),
    length: 0,
    grid: new SpatialGrid(bounds, cellSize),
    bounds,
    cellSize,
  },
  count: 0,
});

export const veinNodeX = (nodes: VeinNodes, i: number): number => nodes.storage.xs[i] ?? NaN;
export const veinNodeY = (nodes: VeinNodes, i: number): number => nodes.storage.ys[i] ?? NaN;
export const veinNodeParent = (nodes: VeinNodes, i: number): number =>
  nodes.storage.parents[i] ?? -1;

export const nearestVeinNode = (nodes: VeinNodes, x: number, y: number): number =>
  nodes.storage.grid.nearest(nodes.storage, nodes.count, x, y);

export const anyVeinNodeWithin = (nodes: VeinNodes, x: number, y: number, radius: number) =>
  nodes.storage.grid.anyWithin(nodes.storage, nodes.count, x, y, radius);

/** Copies of the node arrays, trimmed to `count`, e.g. for sending to another thread. */
export const veinNodeArrays = (nodes: VeinNodes, from = 0) => ({
  xs: nodes.storage.xs.slice(from, nodes.count),
  ys: nodes.storage.ys.slice(from, nodes.count),
  parents: nodes.storage.parents.slice(from, nodes.count),
});

/** Accumulates appended nodes during a step; `finish` returns the resulting view. */
export interface VeinNodeAppender {
  append(x: number, y: number, parent: number): number;
  /** The nodes appended so far, including those from this appender. */
  current(): VeinNodes;
  finish(): VeinNodes;
}

export const appendVeinNodes = (nodes: VeinNodes): VeinNodeAppender => {
  // If a later state has already appended to this storage, branch off a copy
  // rather than overwrite nodes that state can see.
  const storage = nodes.count === nodes.storage.length ? nodes.storage : copyStorage(nodes);
  const view = (): VeinNodes => ({ storage, count: storage.length });
  return {
    append(x, y, parent) {
      if (storage.length === storage.xs.length) grow(storage);
      const i = storage.length;
      storage.xs[i] = x;
      storage.ys[i] = y;
      storage.parents[i] = parent;
      storage.grid.insert(i, x, y);
      storage.length++;
      return i;
    },
    current: view,
    finish: view,
  };
};

const grow = (storage: Storage) => {
  const capacity = storage.xs.length * 2;
  const resize = <T extends Float64Array | Int32Array>(array: T, make: (n: number) => T) => {
    const bigger = make(capacity);
    bigger.set(array);
    return bigger;
  };
  storage.xs = resize(storage.xs, (n) => new Float64Array(n));
  storage.ys = resize(storage.ys, (n) => new Float64Array(n));
  storage.parents = resize(storage.parents, (n) => new Int32Array(n));
};

const copyStorage = (nodes: VeinNodes): Storage => {
  const { storage, count } = nodes;
  const capacity = Math.max(64, storage.xs.length);
  const copy: Storage = {
    xs: new Float64Array(capacity),
    ys: new Float64Array(capacity),
    parents: new Int32Array(capacity),
    length: count,
    grid: new SpatialGrid(storage.bounds, storage.cellSize),
    bounds: storage.bounds,
    cellSize: storage.cellSize,
  };
  copy.xs.set(storage.xs.subarray(0, count));
  copy.ys.set(storage.ys.subarray(0, count));
  copy.parents.set(storage.parents.subarray(0, count));
  for (let i = 0; i < count; i++) copy.grid.insert(i, copy.xs[i] ?? NaN, copy.ys[i] ?? NaN);
  return copy;
};
