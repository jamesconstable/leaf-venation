# The leaf outline the user picks is the final shape, not the starting shape

Under anisotropic growth the blade changes shape as it grows, so the outline could describe either the start or the end of the simulation. We chose the end: users pick or draw the leaf they want to see, and watching a carefully drawn shape get deformed would be surprising. The starting outline is derived by inverting the growth model. The paper's non-uniform model (growth rates depending only on initial y, with a monotone integral for the vertical displacement) can be inverted with the same lookup table it already uses, so this is tractable. A faint ghost of the final outline is shown while the leaf grows.

## Considered Options

- **Outline is the starting shape**: simpler (no inversion), but the result is a shape the user didn't choose.
- **User picks both start and end shapes, tweening between them**: the most expressive, closest to the paper's Figure 5, but too complex for a first implementation. Kept as a possible later feature.
