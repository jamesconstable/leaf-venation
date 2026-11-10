import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { veinPaths } from "./veinPaths";
import { veinWidths } from "./veinWidth";

/**
 *        3   4
 *        |   |
 *    5   2 - +      (node 4's parent is 2; node 3's parent is 2)
 *    |   |
 *    1 - +          (node 5's parent is 1)
 *    |
 *    0
 */
const parents = [-1, 0, 1, 2, 2, 1];

describe("veinPaths", () => {
  it("follows the widest child and starts higher-order veins at other branches", () => {
    // Give node 3 the larger width at the upper branch.
    const widths = [3, 2.5, 2, 1.5, 1, 1];
    const paths = veinPaths(parents, widths);
    expect(paths).toContainEqual({ nodes: [0, 1, 2, 3], order: 1 });
    expect(paths).toContainEqual({ nodes: [2, 4], order: 2 });
    expect(paths).toContainEqual({ nodes: [1, 5], order: 2 });
    expect(paths).toHaveLength(3);
  });

  it("breaks ties between equally wide children by lowest index", () => {
    const paths = veinPaths([-1, 0, 0], [2, 1, 1]);
    expect(paths).toContainEqual({ nodes: [0, 1], order: 1 });
    expect(paths).toContainEqual({ nodes: [0, 2], order: 2 });
  });

  it("starts a first-order vein at every initial vein node", () => {
    const paths = veinPaths([-1, -1, 0, 1], [1, 1, 1, 1]);
    expect(paths.filter(({ order }) => order === 1)).toHaveLength(2);
  });

  it("covers every segment of any tree exactly once", () => {
    const tree = fc
      .array(fc.nat(), { maxLength: 60 })
      .map((choices) => [-1, ...choices.map((choice, i) => choice % (i + 1))]);
    fc.assert(
      fc.property(tree, (treeParents) => {
        const paths = veinPaths(treeParents, veinWidths(treeParents, 2));
        const segments = paths.flatMap(({ nodes }) =>
          nodes.slice(1).map((node, k) => `${nodes[k] ?? -1}->${node}`),
        );
        const expected = treeParents.flatMap((parent, i) =>
          parent >= 0 ? [`${parent}->${i}`] : [],
        );
        expect(segments.sort()).toEqual(expected.sort());
      }),
    );
  });
});
