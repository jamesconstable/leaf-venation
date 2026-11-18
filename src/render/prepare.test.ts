import { describe, expect, it } from "vitest";
import { petiole } from "./prepare";

describe("petiole", () => {
  // A midvein leaving its root up and slightly to the right, 4 px wide.
  const midvein = Array.from({ length: 20 }, (_, k) => ({
    x: 100 + 0.3 * k,
    y: 500 - 2 * k,
    halfWidth: 2,
  }));
  const stalk = petiole(midvein, { x: 100, y: 500 }, 400, 2);

  it("overlaps the midvein, following its centre line exactly", () => {
    const first = stalk[0];
    expect(midvein).toContainEqual(first);
    expect(first?.y).toBeLessThan(500);
  });

  it("leaves the root with the midvein's width", () => {
    const atRoot = stalk.find((p) => p.x === 100 && p.y === 500);
    expect(atRoot?.halfWidth).toBe(2);
  });

  it("leaves the root in the midvein's direction, so the two join without a kink", () => {
    const k = stalk.findIndex((p) => p.x === 100 && p.y === 500);
    const [before, root, after] = [stalk[k - 1], stalk[k], stalk[k + 1]];
    if (before === undefined || root === undefined || after === undefined) throw new Error();
    const angle = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.atan2(b.y - a.y, b.x - a.x);
    // Chords either side of the root differ only by the curve's gentle turn, a few degrees.
    expect(Math.abs(angle(before, root) - angle(root, after))).toBeLessThan(0.1);
  });

  it("hangs below the base", () => {
    expect(stalk.at(-1)?.y).toBeGreaterThan(540);
  });
});
