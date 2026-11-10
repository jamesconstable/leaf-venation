/**
 * The width of the vein segment ending at each vein node, by Murray's law:
 * parentⁿ = Σ childⁿ, where n is the vein width exponent, and the finest veins
 * have width 1 (Runions et al. 2005, Section 3.5). Children always have higher
 * indices than their parents, so one reverse pass suffices.
 *
 * This is a render-time quantity and never feeds back into the simulation, so
 * the non-deterministic `**` operator is acceptable here.
 */
export const veinWidths = (parents: ArrayLike<number>, exponent: number): Float64Array => {
  const count = parents.length;
  const powers = new Float64Array(count);
  const widths = new Float64Array(count);
  for (let i = count - 1; i >= 0; i--) {
    const power = powers[i] === 0 ? 1 : (powers[i] ?? 1);
    widths[i] = power ** (1 / exponent);
    const parent = parents[i] ?? -1;
    if (parent >= 0) powers[parent] = (powers[parent] ?? 0) + power;
  }
  return widths;
};
