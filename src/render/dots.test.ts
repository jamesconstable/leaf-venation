import { describe, expect, it } from "vitest";
import { dotCoverage } from "./dots";

const sum = (values: Float32Array) => values.reduce((total, v) => total + v, 0);

describe("dotCoverage", () => {
  it("covers about the dot's area", () => {
    const coverage = dotCoverage([5, 5, 1.5], 10, 10);
    expect(sum(coverage)).toBeGreaterThan(0.8 * Math.PI * 1.5 ** 2);
    expect(sum(coverage)).toBeLessThan(1.3 * Math.PI * 1.5 ** 2);
  });

  it("fully covers the pixel at the centre of a dot", () => {
    const coverage = dotCoverage([5.5, 5.5, 0.7], 10, 10);
    expect(coverage[5 * 10 + 5]).toBe(1);
  });

  it("combines overlapping dots without exceeding full coverage", () => {
    const one = dotCoverage([5, 5, 1.5], 10, 10);
    const two = dotCoverage([5, 5, 1.5, 5, 5, 1.5], 10, 10);
    expect(sum(two)).toBeGreaterThan(sum(one));
    expect(sum(two)).toBeLessThan(2 * sum(one));
    expect(Math.max(...two)).toBeLessThanOrEqual(1);
  });

  it("clips dots at the edges", () => {
    const coverage = dotCoverage([0, 0, 2], 4, 4);
    expect(sum(coverage)).toBeGreaterThan(0);
    expect(coverage.length).toBe(16);
  });
});
