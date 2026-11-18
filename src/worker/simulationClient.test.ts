import { describe, expect, it } from "vitest";
import type { ProgressMessage } from "./protocol";
import { SnapshotAccumulator } from "./simulationClient";

const progress = (from: number, xs: number[]): ProgressMessage => ({
  type: "progress",
  generation: 1,
  stepCount: 0,
  status: "growing",
  bladeScale: 1,
  veinScale: 1,
  from,
  xs: new Float64Array(xs),
  ys: new Float64Array(xs.map((x) => -x)),
  parents: new Int32Array(xs.map((_, i) => from + i - 1)),
  auxinSources: new Float64Array(),
  anastomoses: new Int32Array(),
});

describe("SnapshotAccumulator", () => {
  it("appends each batch of new vein nodes after the previous ones", () => {
    const accumulator = new SnapshotAccumulator();
    accumulator.add(progress(0, [1, 2]));
    const snapshot = accumulator.add(progress(2, [3]));
    expect([...snapshot.xs]).toEqual([1, 2, 3]);
    expect([...snapshot.ys]).toEqual([-1, -2, -3]);
    expect([...snapshot.parents]).toEqual([-1, 0, 1]);
  });

  it("grows past its initial capacity", () => {
    const accumulator = new SnapshotAccumulator();
    const many = Array.from({ length: 3000 }, (_, i) => i);
    const snapshot = accumulator.add(progress(0, many));
    expect(snapshot.xs).toHaveLength(3000);
    expect(snapshot.xs[2999]).toBe(2999);
  });

  it("starts afresh after a reset", () => {
    const accumulator = new SnapshotAccumulator();
    accumulator.add(progress(0, [1, 2, 3]));
    accumulator.reset();
    expect([...accumulator.add(progress(0, [9])).xs]).toEqual([9]);
  });
});

it("leaves snapshots already handed out intact after a reset", () => {
  const accumulator = new SnapshotAccumulator();
  const before = accumulator.add(progress(0, [1, 2, 3]));
  accumulator.reset();
  accumulator.add(progress(0, [7, 8, 9]));
  expect([...before.xs]).toEqual([1, 2, 3]);
});
