/** A vein as one continuous path through the vein graph, for drawing as a smooth curve. */
export interface VeinPath {
  /**
   * Vein node indices along the vein. A branch starts at the node it branches
   * from, so its curve joins its parent vein.
   */
  readonly nodes: readonly number[];
  /** The vein order: 1 for veins leaving the base, one more for each branching away. */
  readonly order: number;
}

/**
 * Splits the vein graph into vein paths: at each branch point the widest child
 * continues its parent's vein (and order), and every other child starts a new
 * vein of the next order. Ties go to the lowest index, so the result is
 * deterministic.
 */
export const veinPaths = (parents: ArrayLike<number>, widths: ArrayLike<number>): VeinPath[] => {
  const count = parents.length;
  const children: number[][] = Array.from({ length: count }, () => []);
  const roots: number[] = [];
  for (let i = 0; i < count; i++) {
    const parent = parents[i] ?? -1;
    if (parent >= 0) children[parent]?.push(i);
    else roots.push(i);
  }

  const paths: VeinPath[] = [];
  const pending: { nodes: number[]; order: number }[] = roots.map((root) => ({
    nodes: [root],
    order: 1,
  }));
  for (let start = pending.pop(); start !== undefined; start = pending.pop()) {
    const nodes = start.nodes;
    for (let current = nodes[nodes.length - 1]; current !== undefined;) {
      const kids = children[current] ?? [];
      if (kids.length === 0) break;
      const widest = kids.reduce((best, kid) =>
        (widths[kid] ?? 0) > (widths[best] ?? 0) ? kid : best,
      );
      for (const kid of kids) {
        if (kid !== widest) pending.push({ nodes: [current, kid], order: start.order + 1 });
      }
      nodes.push(widest);
      current = widest;
    }
    paths.push({ nodes, order: start.order });
  }
  return paths;
};
