import { regionContains, scaleRegion, type Region } from "../geometry/region";
import { distanceSquared, type Vec2 } from "../geometry/vector";
import { triangulateVeinNodes, urquhartNeighbourhood } from "./neighbourhood";
import { random, randomStateFromSeed, type RandomState } from "./random";
import { SpatialGrid } from "./spatialGrid";
import {
  anyVeinNodeWithin,
  appendVeinNodes,
  emptyVeinNodes,
  nearestVeinNode,
  veinNodeParent,
  veinNodeX,
  veinNodeY,
  type VeinNodes,
} from "./veinNodes";

/**
 * Identifies the simulation's behaviour. Bump it whenever a change alters the
 * result for the same settings and random seed, once the current version has
 * been released (ADR 0002). The golden test flags such changes.
 */
export const MODEL_VERSION = 1;

export type Venation = "open" | "closed";

/**
 * How the blade grows during the simulation (Runions et al. 2005, Section 3.3).
 * Both growth types increase the leaf length linearly, from `initialSize` to
 * the full size, by `growthPerStep` each step; both are fractions of the final
 * leaf length.
 */
export type Growth =
  | { readonly type: "none" }
  | {
      readonly type: "marginal" | "isogonic";
      readonly initialSize: number;
      readonly growthPerStep: number;
    };

/**
 * The leaf-defining simulation parameters, with distances relative to the leaf
 * length so that they keep their meaning at any detail.
 */
export interface VenationParameters {
  readonly venation: Venation;
  /** Kill distance as a fraction of leaf length. */
  readonly killDistance: number;
  /** Birth distance as a fraction of leaf length. */
  readonly birthDistance: number;
  /** Darts thrown per step per unit area of a blade of length 1. */
  readonly dartDensity: number;
  readonly growth: Growth;
}

/**
 * A complete, self-contained description of one simulation, in vein segment
 * lengths, at the leaf's final size.
 *
 * Simulation coordinates are those of the final leaf. Under marginal growth the
 * blade grows about its base within them, and vein nodes and auxin sources stay
 * put. Under isogonic growth everything grows together, so instead of moving
 * every point the simulation shrinks its unit of distance (Runions et al. 2005,
 * "Uniform growth"): a vein segment length is 1 / size in these coordinates.
 */
export interface SimulationConfig {
  /** The blade at its final size. */
  readonly blade: Region;
  readonly initialVeinNodes: readonly Vec2[];
  readonly venation: Venation;
  readonly killDistance: number;
  readonly birthDistance: number;
  /** Darts per step once the leaf reaches its final size; fewer while it is smaller. */
  readonly dartsPerStep: number;
  readonly growth: Growth;
  readonly randomSeed: string;
  readonly nodeBudget: number;
  /** The simulation has settled after this many consecutive steps without a new vein node. */
  readonly settleSteps: number;
}

export interface SimulationInput {
  /** The blade at leaf length 1. */
  readonly blade: Region;
  /** Initial vein node positions at leaf length 1. */
  readonly initialVeinNodes: readonly Vec2[];
  readonly parameters: VenationParameters;
  /** The leaf length in vein segment lengths. */
  readonly detail: number;
  readonly randomSeed: string;
}

export const DEFAULT_NODE_BUDGET = 100_000;

export const simulationConfig = (input: SimulationInput): SimulationConfig => {
  const { parameters, detail } = input;
  return {
    blade: scaleRegion(input.blade, detail),
    initialVeinNodes: input.initialVeinNodes.map(({ x, y }) => ({ x: x * detail, y: y * detail })),
    venation: parameters.venation,
    // Below one vein segment length a vein can step straight past a source.
    killDistance: Math.max(1, parameters.killDistance * detail),
    birthDistance: Math.max(1, parameters.birthDistance * detail),
    dartsPerStep: Math.max(1, Math.round(parameters.dartDensity * input.blade.area)),
    growth: parameters.growth,
    randomSeed: input.randomSeed,
    nodeBudget: DEFAULT_NODE_BUDGET,
    settleSteps: 20,
  };
};

export interface AuxinSource {
  readonly x: number;
  readonly y: number;
  /**
   * Closed venation only: once a vein node comes within the kill distance, the
   * vein nodes still growing toward this source. The source is removed when all
   * of them have reached it or turned away. `undefined` until then.
   */
  readonly tagged?: readonly number[];
  /**
   * Closed venation only: the vein nodes that have reached this source (or were
   * blocked just short of it). They are joined by anastomoses when it is removed.
   */
  readonly arrived?: readonly number[];
}

/** A join between two vein nodes whose veins grew toward the same auxin source, closing a loop. */
export type Anastomosis = readonly [number, number];

export type SimulationStatus = "growing" | "settled" | "budgetReached";

export interface SimulationState {
  readonly config: SimulationConfig;
  readonly stepCount: number;
  readonly veinNodes: VeinNodes;
  readonly auxinSources: readonly AuxinSource[];
  /** Closed venation only; always empty for open venation. */
  readonly anastomoses: readonly Anastomosis[];
  readonly random: RandomState;
  /** The current leaf length as a fraction of its final length. */
  readonly size: number;
  readonly stepsWithoutGrowth: number;
  readonly status: SimulationStatus;
}

/** New vein nodes closer than this to an existing one are rejected (they would stutter). */
const MINIMUM_SEPARATION = 0.1;

/** How much the blade is scaled, about its base, from its final size. */
export const bladeScale = (state: SimulationState): number => state.size;

/** How much vein nodes and auxin sources are scaled from simulation coordinates to the current leaf. */
export const veinScale = (state: SimulationState): number =>
  state.config.growth.type === "isogonic" ? state.size : 1;

/** One vein segment length, in simulation coordinates. */
const unit = (state: SimulationState): number => 1 / veinScale(state);

const inBlade = (state: SimulationState, x: number, y: number): boolean =>
  state.config.growth.type === "marginal"
    ? regionContains(state.config.blade, x / state.size, y / state.size)
    : regionContains(state.config.blade, x, y);

const nextSize = (state: SimulationState): number =>
  state.config.growth.type === "none"
    ? 1
    : Math.min(1, state.size + state.config.growth.growthPerStep);

export const initialState = (config: SimulationConfig): SimulationState => {
  const size = config.growth.type === "none" ? 1 : config.growth.initialSize;
  // Under marginal growth the initial vein nodes start where the smaller blade's base region is.
  const scale = config.growth.type === "marginal" ? size : 1;
  const appender = appendVeinNodes(emptyVeinNodes(config.blade.bounds, gridCellSize(config)));
  for (const { x, y } of config.initialVeinNodes) appender.append(x * scale, y * scale, -1);
  return {
    config,
    stepCount: 0,
    veinNodes: appender.finish(),
    auxinSources: [],
    anastomoses: [],
    random: randomStateFromSeed(config.randomSeed),
    size,
    stepsWithoutGrowth: 0,
    status: "growing",
  };
};

const gridCellSize = (config: SimulationConfig) => Math.max(2, config.birthDistance);

/**
 * Advances the simulation by one step (Runions et al. 2005, Section 3.3):
 * grow the blade, place new auxin sources by dart throwing, find which vein nodes each source
 * influences, remove sources the veins have reached (joining the veins that
 * met there, in closed venation), then grow a new vein node from every
 * influenced node. A finished simulation is returned unchanged.
 */
export const step = (previous: SimulationState): SimulationState => {
  if (previous.status !== "growing") return previous;
  const state = { ...previous, size: nextSize(previous) };
  const { config } = state;
  const rng = random(state.random);

  const placed = [...state.auxinSources, ...throwDarts(state, rng.next)];
  const influenced =
    config.venation === "open"
      ? placed.map((s) => [nearestVeinNode(state.veinNodes, s.x, s.y)].filter((v) => v >= 0))
      : closedInfluence(state, placed);

  const killDistance = config.killDistance * unit(state);
  const kill = killDistance * killDistance;
  const reached = (v: number, s: AuxinSource) =>
    distanceSquared(veinNodeX(state.veinNodes, v), veinNodeY(state.veinNodes, v), s.x, s.y) < kill;

  const surviving: { source: AuxinSource; influences: readonly number[] }[] = [];
  const anastomoses = [...state.anastomoses];
  const joined = new Set(anastomoses.map(([a, b]) => `${a},${b}`));
  placed.forEach((source, i) => {
    const neighbourhood = influenced[i] ?? [];
    if (config.venation === "open") {
      if (!neighbourhood.some((v) => reached(v, source))) {
        surviving.push({ source, influences: neighbourhood });
      }
      return;
    }
    const pending = neighbourhood.filter((v) => !reached(v, source));
    // A tagged vein dropping out of the neighbourhood has usually been excluded
    // by a vein that just arrived, not turned away, so it is joined as well.
    const excluded = (source.tagged ?? []).filter((v) => !neighbourhood.includes(v));
    const arrived = union(source.arrived ?? [], [
      ...neighbourhood.filter((v) => reached(v, source)),
      ...excluded,
    ]);
    const tagged =
      source.tagged === undefined
        ? pending.length < neighbourhood.length
          ? pending
          : undefined
        : source.tagged.filter((v) => pending.includes(v));
    if (tagged?.length === 0) {
      for (const join of joinArrivals(state, source, arrived)) {
        // Two veins can meet at more than one source; join them once.
        const key = `${join[0]},${join[1]}`;
        if (!joined.has(key)) anastomoses.push(join);
        joined.add(key);
      }
      return;
    }
    surviving.push({
      source:
        tagged === undefined
          ? source
          : { x: source.x, y: source.y, tagged, ...(arrived.length > 0 ? { arrived } : {}) },
      influences: pending,
    });
  });

  const { veinNodes, children } = grow(state, surviving);
  const added = veinNodes.count - state.veinNodes.count;
  // Tags pass to the new vein nodes. A tagged node that could not grow (blocked
  // by a node that already reached the source) is released, as if it had left
  // the source's zone of influence; otherwise the source would wait forever. It
  // counts as having arrived, so it is joined to the others.
  const auxinSources = surviving.map(({ source }) => {
    if (source.tagged === undefined) return source;
    const blocked = source.tagged.filter((v) => !children.has(v));
    return {
      ...source,
      tagged: source.tagged.flatMap((v) => children.get(v) ?? []),
      arrived: union(source.arrived ?? [], blocked),
    };
  });

  // The simulation can only settle once the blade has finished growing.
  const stepsWithoutGrowth = added > 0 || state.size < 1 ? 0 : state.stepsWithoutGrowth + 1;
  const status: SimulationStatus =
    veinNodes.count >= config.nodeBudget
      ? "budgetReached"
      : stepsWithoutGrowth >= config.settleSteps
        ? "settled"
        : "growing";

  return {
    config,
    stepCount: state.stepCount + 1,
    veinNodes,
    auxinSources,
    anastomoses,
    random: rng.state(),
    size: state.size,
    stepsWithoutGrowth,
    status,
  };
};

const union = (a: readonly number[], b: readonly number[]): number[] =>
  b.length === 0 ? [...a] : [...a, ...b.filter((v) => !a.includes(v))];

/**
 * Joins the veins that met at a removed source (Runions et al. 2005 describe
 * when loops form but not how the veins connect; see docs/design.md). Every
 * arrived node is joined to the one closest to the source, unless they are
 * already adjacent in the vein graph or implausibly far apart.
 */
const joinArrivals = (
  state: SimulationState,
  source: AuxinSource,
  arrived: readonly number[],
): Anastomosis[] => {
  if (arrived.length < 2) return [];
  const nodes = state.veinNodes;
  const x = (v: number) => veinNodeX(nodes, v);
  const y = (v: number) => veinNodeY(nodes, v);
  const hub = arrived.reduce((best, v) =>
    distanceSquared(x(v), y(v), source.x, source.y) <
    distanceSquared(x(best), y(best), source.x, source.y)
      ? v
      : best,
  );
  const maximumLength = (2 * state.config.killDistance + 2) * unit(state);
  const parent = (v: number) => veinNodeParent(nodes, v);
  const adjacent = (a: number, b: number) =>
    parent(a) === b || parent(b) === a || (parent(a) >= 0 && parent(a) === parent(b));
  return arrived
    .filter((v) => v !== hub && !adjacent(v, hub))
    .filter((v) => distanceSquared(x(v), y(v), x(hub), y(hub)) <= maximumLength * maximumLength)
    .map((v): Anastomosis => [Math.min(v, hub), Math.max(v, hub)]);
};

/**
 * Candidate sources uniformly distributed over the blade's bounding box, kept
 * if inside the blade and at least the birth distance from every existing
 * source and vein node (Runions et al. 2005, "Auxin source placement").
 */
const throwDarts = (state: SimulationState, next: () => number): AuxinSource[] => {
  const { blade, dartsPerStep } = state.config;
  const birthDistance = state.config.birthDistance * unit(state);
  // Darts land on the current blade, at the same density per unit of leaf area at any size.
  const scale = state.config.growth.type === "marginal" ? state.size : 1;
  const minX = blade.bounds.minX * scale;
  const minY = blade.bounds.minY * scale;
  const maxX = blade.bounds.maxX * scale;
  const maxY = blade.bounds.maxY * scale;
  const darts = Math.max(1, Math.round(dartsPerStep * state.size * state.size));
  const xs = state.auxinSources.map((s) => s.x);
  const ys = state.auxinSources.map((s) => s.y);
  const grid = new SpatialGrid(blade.bounds, gridCellSize(state.config));
  xs.forEach((x, i) => {
    grid.insert(i, x, ys[i] ?? NaN);
  });

  const accepted: AuxinSource[] = [];
  for (let dart = 0; dart < darts; dart++) {
    const x = minX + next() * (maxX - minX);
    const y = minY + next() * (maxY - minY);
    if (!inBlade(state, x, y)) continue;
    if (grid.anyWithin({ xs, ys }, xs.length, x, y, birthDistance)) continue;
    if (anyVeinNodeWithin(state.veinNodes, x, y, birthDistance)) continue;
    grid.insert(xs.length, x, y);
    xs.push(x);
    ys.push(y);
    accepted.push({ x, y });
  }
  return accepted;
};

const closedInfluence = (state: SimulationState, sources: readonly AuxinSource[]) => {
  if (sources.length === 0) return [];
  const triangulation = triangulateVeinNodes(state.veinNodes, state.config.blade.bounds);
  return sources.map((s) => urquhartNeighbourhood(triangulation, s.x, s.y));
};

/**
 * Grows one new vein node from each influenced node, one vein segment length
 * along the average direction to its sources (Runions et al. 2005, Equation 1).
 * Nodes are processed in index order so results are deterministic.
 *
 * Deviation from the paper: when sources on opposite sides of a node nearly
 * cancel, the average points sideways, usually onto a node grown earlier, and
 * the paper's rule makes no progress, forever. Only in that case, the node
 * instead grows one vein toward each of its sources separately.
 */
const grow = (
  state: SimulationState,
  surviving: readonly { source: AuxinSource; influences: readonly number[] }[],
) => {
  const nodes = state.veinNodes;
  const segment = unit(state);
  const pulls = new Map<number, { x: number; y: number }[]>();
  for (const { source, influences } of surviving) {
    for (const v of influences) {
      const dx = source.x - veinNodeX(nodes, v);
      const dy = source.y - veinNodeY(nodes, v);
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length === 0) continue;
      pulls.set(v, [...(pulls.get(v) ?? []), { x: dx / length, y: dy / length }]);
    }
  }

  const appender = appendVeinNodes(nodes);
  const children = new Map<number, number[]>();
  const tryGrow = (v: number, dx: number, dy: number): boolean => {
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length < 1e-9 || appender.current().count >= state.config.nodeBudget) return false;
    const x = veinNodeX(nodes, v) + (segment * dx) / length;
    const y = veinNodeY(nodes, v) + (segment * dy) / length;
    if (!inBlade(state, x, y)) return false;
    if (anyVeinNodeWithin(appender.current(), x, y, MINIMUM_SEPARATION * segment)) return false;
    const child = appender.append(x, y, v);
    children.set(v, [...(children.get(v) ?? []), child]);
    return true;
  };

  for (const v of [...pulls.keys()].sort((a, b) => a - b)) {
    const directions = pulls.get(v) ?? [];
    const sum = directions.reduce((total, d) => ({ x: total.x + d.x, y: total.y + d.y }), {
      x: 0,
      y: 0,
    });
    if (!tryGrow(v, sum.x, sum.y) && directions.length > 1) {
      for (const d of directions) tryGrow(v, d.x, d.y);
    }
  }
  return { veinNodes: appender.finish(), children };
};
