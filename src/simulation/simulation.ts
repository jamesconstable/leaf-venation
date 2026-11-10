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
  veinNodeX,
  veinNodeY,
  type VeinNodes,
} from "./veinNodes";

export type Venation = "open" | "closed";

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
}

/** A complete, self-contained description of one simulation, in vein segment lengths. */
export interface SimulationConfig {
  readonly blade: Region;
  readonly initialVeinNodes: readonly Vec2[];
  readonly venation: Venation;
  readonly killDistance: number;
  readonly birthDistance: number;
  readonly dartsPerStep: number;
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
}

export type SimulationStatus = "growing" | "settled" | "budgetReached";

export interface SimulationState {
  readonly config: SimulationConfig;
  readonly stepCount: number;
  readonly veinNodes: VeinNodes;
  readonly auxinSources: readonly AuxinSource[];
  readonly random: RandomState;
  readonly stepsWithoutGrowth: number;
  readonly status: SimulationStatus;
}

/** New vein nodes closer than this to an existing one are rejected (they would stutter). */
const MINIMUM_SEPARATION = 0.1;

export const initialState = (config: SimulationConfig): SimulationState => {
  const appender = appendVeinNodes(emptyVeinNodes(config.blade.bounds, gridCellSize(config)));
  for (const { x, y } of config.initialVeinNodes) appender.append(x, y, -1);
  return {
    config,
    stepCount: 0,
    veinNodes: appender.finish(),
    auxinSources: [],
    random: randomStateFromSeed(config.randomSeed),
    stepsWithoutGrowth: 0,
    status: "growing",
  };
};

const gridCellSize = (config: SimulationConfig) => Math.max(2, config.birthDistance);

/**
 * Advances the simulation by one step (Runions et al. 2005, Section 3.3):
 * place new auxin sources by dart throwing, find which vein nodes each source
 * influences, remove sources the veins have reached, then grow a new vein node
 * from every influenced node. A finished simulation is returned unchanged.
 */
export const step = (state: SimulationState): SimulationState => {
  if (state.status !== "growing") return state;
  const { config } = state;
  const rng = random(state.random);

  const placed = [...state.auxinSources, ...throwDarts(state, rng.next)];
  const influenced =
    config.venation === "open"
      ? placed.map((s) => [nearestVeinNode(state.veinNodes, s.x, s.y)].filter((v) => v >= 0))
      : closedInfluence(state, placed);

  const kill = config.killDistance * config.killDistance;
  const reached = (v: number, s: AuxinSource) =>
    distanceSquared(veinNodeX(state.veinNodes, v), veinNodeY(state.veinNodes, v), s.x, s.y) < kill;

  const surviving: { source: AuxinSource; influences: readonly number[] }[] = [];
  placed.forEach((source, i) => {
    const neighbourhood = influenced[i] ?? [];
    if (config.venation === "open") {
      if (!neighbourhood.some((v) => reached(v, source))) {
        surviving.push({ source, influences: neighbourhood });
      }
      return;
    }
    const pending = neighbourhood.filter((v) => !reached(v, source));
    const tagged =
      source.tagged === undefined
        ? pending.length < neighbourhood.length
          ? pending
          : undefined
        : source.tagged.filter((v) => pending.includes(v));
    if (tagged?.length === 0) return;
    surviving.push({
      source: tagged === undefined ? source : { x: source.x, y: source.y, tagged },
      influences: pending,
    });
  });

  const { veinNodes, children } = grow(state.veinNodes, surviving, config);
  const added = veinNodes.count - state.veinNodes.count;
  const auxinSources = surviving.map(({ source }) =>
    source.tagged === undefined
      ? source
      : { ...source, tagged: source.tagged.flatMap((v) => children.get(v) ?? [v]) },
  );

  const stepsWithoutGrowth = added > 0 ? 0 : state.stepsWithoutGrowth + 1;
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
    random: rng.state(),
    stepsWithoutGrowth,
    status,
  };
};

/**
 * Candidate sources uniformly distributed over the blade's bounding box, kept
 * if inside the blade and at least the birth distance from every existing
 * source and vein node (Runions et al. 2005, "Auxin source placement").
 */
const throwDarts = (state: SimulationState, next: () => number): AuxinSource[] => {
  const { blade, birthDistance, dartsPerStep } = state.config;
  const { minX, minY, maxX, maxY } = blade.bounds;
  const xs = state.auxinSources.map((s) => s.x);
  const ys = state.auxinSources.map((s) => s.y);
  const grid = new SpatialGrid(blade.bounds, gridCellSize(state.config));
  xs.forEach((x, i) => {
    grid.insert(i, x, ys[i] ?? NaN);
  });

  const accepted: AuxinSource[] = [];
  for (let dart = 0; dart < dartsPerStep; dart++) {
    const x = minX + next() * (maxX - minX);
    const y = minY + next() * (maxY - minY);
    if (!regionContains(blade, x, y)) continue;
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
 */
const grow = (
  nodes: VeinNodes,
  surviving: readonly { source: AuxinSource; influences: readonly number[] }[],
  config: SimulationConfig,
) => {
  const directions = new Map<number, { x: number; y: number }>();
  for (const { source, influences } of surviving) {
    for (const v of influences) {
      const dx = source.x - veinNodeX(nodes, v);
      const dy = source.y - veinNodeY(nodes, v);
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length === 0) continue;
      const sum = directions.get(v) ?? { x: 0, y: 0 };
      directions.set(v, { x: sum.x + dx / length, y: sum.y + dy / length });
    }
  }

  const appender = appendVeinNodes(nodes);
  const children = new Map<number, number[]>();
  for (const v of [...directions.keys()].sort((a, b) => a - b)) {
    if (appender.current().count >= config.nodeBudget) break;
    const { x: dx, y: dy } = directions.get(v) ?? { x: 0, y: 0 };
    const length = Math.sqrt(dx * dx + dy * dy);
    // Sources pulling in opposite directions cancel out; there is nowhere to grow.
    if (length < 1e-9) continue;
    const x = veinNodeX(nodes, v) + dx / length;
    const y = veinNodeY(nodes, v) + dy / length;
    if (!regionContains(config.blade, x, y)) continue;
    if (anyVeinNodeWithin(appender.current(), x, y, MINIMUM_SEPARATION)) continue;
    const child = appender.append(x, y, v);
    children.set(v, [...(children.get(v) ?? []), child]);
  }
  return { veinNodes: appender.finish(), children };
};
