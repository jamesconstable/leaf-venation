import type { SimulationConfig } from "../simulation/simulation";
import type { VenationSnapshot } from "../simulation/snapshot";
import type { FromWorker, ProgressMessage, ToWorker } from "./protocol";

/**
 * Accumulates the vein nodes reported in progress messages into growing arrays.
 * Pure bookkeeping, separate from the worker so it can be unit tested.
 */
export class SnapshotAccumulator {
  private xs = new Float64Array(1024);
  private ys = new Float64Array(1024);
  private parents = new Int32Array(1024);
  private count = 0;

  reset(): void {
    this.count = 0;
  }

  add(message: ProgressMessage): VenationSnapshot {
    const count = message.from + message.xs.length;
    if (count > this.xs.length) {
      const capacity = Math.max(count, 2 * this.xs.length);
      this.xs = grow(this.xs, new Float64Array(capacity));
      this.ys = grow(this.ys, new Float64Array(capacity));
      this.parents = grow(this.parents, new Int32Array(capacity));
    }
    this.xs.set(message.xs, message.from);
    this.ys.set(message.ys, message.from);
    this.parents.set(message.parents, message.from);
    this.count = count;
    return {
      stepCount: message.stepCount,
      status: message.status,
      xs: this.xs.subarray(0, this.count),
      ys: this.ys.subarray(0, this.count),
      parents: this.parents.subarray(0, this.count),
      auxinSources: message.auxinSources,
      anastomoses: message.anastomoses,
    };
  }
}

const grow = <T extends Float64Array | Int32Array>(from: T, to: T): T => {
  to.set(from);
  return to;
};

/**
 * Runs simulations in a Web Worker. The caller asks for more steps with
 * `advance` (typically once per animation frame); at most one request is in
 * flight at a time, so a slow step never builds up a backlog.
 */
export class SimulationClient {
  private readonly worker = new Worker(new URL("./simulationWorker.ts", import.meta.url), {
    type: "module",
  });
  private readonly accumulator = new SnapshotAccumulator();
  private generation = 0;
  private waiting = false;
  private latest: VenationSnapshot | undefined;

  constructor(private readonly onSnapshot: (snapshot: VenationSnapshot) => void) {
    this.worker.onmessage = ({ data }: MessageEvent<FromWorker>) => {
      if (data.generation !== this.generation) return;
      this.waiting = false;
      this.latest = this.accumulator.add(data);
      this.onSnapshot(this.latest);
    };
  }

  start(config: SimulationConfig): void {
    this.generation++;
    this.accumulator.reset();
    this.latest = undefined;
    this.waiting = true;
    this.post({ type: "start", generation: this.generation, config });
  }

  advance(steps: number): void {
    if (this.waiting || this.latest?.status !== "growing") return;
    this.waiting = true;
    this.post({ type: "advance", generation: this.generation, steps });
  }

  dispose(): void {
    this.worker.terminate();
  }

  private post(message: ToWorker) {
    this.worker.postMessage(message);
  }
}
