import type { SimulationStatus } from "./simulation";

/** Everything needed to draw a simulation's progress, as plain arrays. */
export interface VenationSnapshot {
  readonly stepCount: number;
  readonly status: SimulationStatus;
  /** Vein node positions and parent indices (-1 for initial vein nodes). */
  readonly xs: Float64Array;
  readonly ys: Float64Array;
  readonly parents: Int32Array;
  /** Auxin source positions as interleaved x, y pairs. */
  readonly auxinSources: Float64Array;
  /** Anastomoses as interleaved pairs of vein node indices. */
  readonly anastomoses: Int32Array;
}
