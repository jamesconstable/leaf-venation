import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ribbon, smoothCentreLine, type RibbonPoint } from "./ribbon";

const point = (x: number, y: number, halfWidth = 1): RibbonPoint => ({ x, y, halfWidth });

describe("smoothCentreLine", () => {
  it("passes through every original point", () => {
    const points = [point(0, 0), point(1, 0.5), point(2, 0), point(3, 1)];
    const smooth = smoothCentreLine(points, 4);
    for (const original of points) {
      expect(smooth).toContainEqual(original);
    }
    expect(smooth).toHaveLength(3 * 4 + 1);
  });

  it("interpolates half widths between points", () => {
    const smooth = smoothCentreLine([point(0, 0, 4), point(1, 0, 2), point(2, 0, 2)], 2);
    expect(smooth[1]?.halfWidth).toBe(3);
  });

  it("leaves one- and two-point lines unchanged", () => {
    expect(smoothCentreLine([point(0, 0), point(1, 1)], 8)).toEqual([point(0, 0), point(1, 1)]);
  });
});

describe("ribbon", () => {
  it("puts its edges a half width either side of the centre line", () => {
    const coordinate = fc.double({ min: -100, max: 100, noNaN: true });
    fc.assert(
      fc.property(
        fc.array(fc.tuple(coordinate, coordinate), { minLength: 2, maxLength: 10 }),
        fc.double({ min: 0.1, max: 5, noNaN: true }),
        (xys, halfWidth) => {
          const centre = xys.map(([x, y]) => point(x, y, halfWidth));
          const { left, right } = ribbon(centre);
          centre.forEach((c, i) => {
            const [l, r] = [left[i], right[i]];
            if (l === undefined || r === undefined) throw new Error("missing edge point");
            // Midway between the edges is the centre line.
            expect((l.x + r.x) / 2).toBeCloseTo(c.x, 9);
            expect((l.y + r.y) / 2).toBeCloseTo(c.y, 9);
          });
        },
      ),
    );
  });

  it("is as wide as twice the half width, across a straight line", () => {
    const { left, right } = ribbon([point(0, 0, 2), point(10, 0, 2)]);
    expect(left[0]?.y).toBe(2);
    expect(right[0]?.y).toBe(-2);
  });
});
