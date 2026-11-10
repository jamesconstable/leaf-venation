/// <reference lib="webworker" />
import { initialState, step, type SimulationState } from "../simulation/simulation";
import { veinNodeArrays } from "../simulation/veinNodes";
import type { FromWorker, ToWorker } from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

let generation = -1;
let state: SimulationState | undefined;
let sentCount = 0;

const reportProgress = (current: SimulationState) => {
  const { xs, ys, parents } = veinNodeArrays(current.veinNodes, sentCount);
  const auxinSources = new Float64Array(current.auxinSources.flatMap((s) => [s.x, s.y]));
  const anastomoses = new Int32Array(current.anastomoses.flat());
  const message: FromWorker = {
    type: "progress",
    generation,
    stepCount: current.stepCount,
    status: current.status,
    from: sentCount,
    xs,
    ys,
    parents,
    auxinSources,
    anastomoses,
  };
  sentCount = current.veinNodes.count;
  self.postMessage(message, [
    xs.buffer,
    ys.buffer,
    parents.buffer,
    auxinSources.buffer,
    anastomoses.buffer,
  ]);
};

self.onmessage = ({ data }: MessageEvent<ToWorker>) => {
  switch (data.type) {
    case "start":
      generation = data.generation;
      state = initialState(data.config);
      sentCount = 0;
      reportProgress(state);
      break;
    case "advance": {
      if (data.generation !== generation || state === undefined) return;
      for (let i = 0; i < data.steps && state.status === "growing"; i++) state = step(state);
      reportProgress(state);
      break;
    }
  }
};
