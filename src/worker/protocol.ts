import type { SimulationConfig, SimulationStatus } from "../simulation/simulation";

/**
 * Messages between the main thread and the simulation worker. Each simulation
 * gets a new generation number, so the main thread can ignore messages about a
 * simulation it has since replaced.
 */
export type ToWorker =
  | { readonly type: "start"; readonly generation: number; readonly config: SimulationConfig }
  | { readonly type: "advance"; readonly generation: number; readonly steps: number };

export interface ProgressMessage {
  readonly type: "progress";
  readonly generation: number;
  readonly stepCount: number;
  readonly status: SimulationStatus;
  readonly bladeScale: number;
  readonly veinScale: number;
  /** The index of the first vein node in the arrays below; earlier nodes were sent before. */
  readonly from: number;
  readonly xs: Float64Array;
  readonly ys: Float64Array;
  readonly parents: Int32Array;
  /** All current auxin sources, as interleaved x, y pairs. */
  readonly auxinSources: Float64Array;
  /** All anastomoses so far, as interleaved pairs of vein node indices. */
  readonly anastomoses: Int32Array;
}

export type FromWorker = ProgressMessage;
