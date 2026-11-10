import { vec2 } from "../geometry/vector";
import type { LeafOutline } from "../outline/outline";

export interface CatalogueLeafOutline {
  readonly id: string;
  /** The botanical term, e.g. "Ovate". */
  readonly name: string;
  /** What the term means in everyday words. */
  readonly description: string;
  readonly outline: LeafOutline;
}

/** Just inside the base, so the initial vein node is unambiguously within the blade. */
const base = [vec2(0, 0.01)];

export const leafOutlines: readonly CatalogueLeafOutline[] = [
  {
    id: "ovate",
    name: "Ovate",
    description: "Egg-shaped, widest below the middle",
    outline: {
      symmetric: true,
      margin: [
        vec2(0, 0),
        vec2(0.14, 0),
        vec2(0.33, 0.12),
        vec2(0.33, 0.36),
        vec2(0.33, 0.6),
        vec2(0.13, 0.84),
        vec2(0, 1),
      ],
      fenestrations: [],
      initialVeinNodes: base,
    },
  },
  {
    id: "elliptic",
    name: "Elliptic",
    description: "Oval, widest at the middle and tapering equally at both ends",
    outline: {
      symmetric: true,
      margin: [
        vec2(0, 0),
        vec2(0.1, 0.06),
        vec2(0.25, 0.24),
        vec2(0.25, 0.5),
        vec2(0.25, 0.76),
        vec2(0.1, 0.94),
        vec2(0, 1),
      ],
      fenestrations: [],
      initialVeinNodes: base,
    },
  },
  {
    id: "cordate",
    name: "Cordate",
    description: "Heart-shaped, with rounded lobes either side of the base",
    outline: {
      symmetric: true,
      margin: [
        vec2(0, 0),
        vec2(0.05, -0.08),
        vec2(0.2, -0.12),
        vec2(0.3, -0.05),
        vec2(0.44, 0.048),
        vec2(0.4, 0.35),
        vec2(0.25, 0.6),
        vec2(0.16, 0.75),
        vec2(0.06, 0.9),
        vec2(0, 1),
      ],
      fenestrations: [],
      initialVeinNodes: base,
    },
  },
];
