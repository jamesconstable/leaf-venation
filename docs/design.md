# Design

Decisions agreed during the initial design session (2026-11-10/11). Vocabulary is defined in [GLOSSARY.md](../GLOSSARY.md); decisions that are surprising or hard to reverse are in [adr/](adr/). The original brief is [brief.md](brief.md); milestones are in [roadmap.md](roadmap.md).

## Technology

- **TypeScript** in strict mode, written in a functional style (ADR 0001).
- **Vite** (build and dev server), **Vitest** (tests), **fast-check** (property tests), **typescript-eslint** (strict, type-checked) and **Prettier**, with **npm**.
- **SolidJS** for the options column only; the canvas is managed outside it.
- **lefthook** git hooks run type checking, linting and tests locally. No GitHub Actions or Pages while the repo is private; going public is decided between milestones 3 and 4.
- Desktop first in evergreen browsers (Chrome, Firefox, Safari), with **WebGL2 required**. Narrow screens get a drawer layout.

## Architecture

```
ui/          SolidJS components                 → render, share, catalogue, worker
render/      renderer interface, styles, WebGL background → simulation, outline
share/       URL codec, SVG/PNG export          → simulation, outline
worker/      Web Worker and its main-thread client → simulation
catalogue/   leaf outlines, specimens, styles as data → outline
outline/     outlines, teeth, fenestrations, star-shapedness → geometry
simulation/  spatial index, growth, venation, vein width (pure; no DOM) → geometry
geometry/    points, polygons, regions with holes
```

The exact rules are in `eslint.config.js`. ESLint also bans `Math.random`, `Math.hypot` and transcendental functions in `simulation/`, `outline/` and `geometry/`, since they could differ between browsers (ADR 0002).

Dependencies only point downward; a lint rule enforces it. `simulation/` exposes a narrow, pure `step(state) → state` interface.

- The simulation runs in a **Web Worker** and sends snapshots (transferable typed arrays) to the main thread. Draw speed means simulation steps per frame.
- **Rendering**: each frame, `prepareLeaf` turns a snapshot into screen geometry (current blade, ghost outline, and each vein as a smoothed, tapering ribbon along its vein path), and the style paints it onto a transparent Canvas2D layer above a backdrop. Backdrops need no WebGL so far: bokeh layers are painted at low resolution, blurred, scaled up by the browser and drifted with CSS transforms; paper is a generated texture. WebGL remains an option behind the same interfaces if a style needs it. **SVG export** is a pure function of the simulation model, never a capture of the screen.
- **Leaf zoom** magnifies the drawing through the canvas transform rather than redrawing the leaf larger, so every mark grows with it. Bitmaps a style paints offscreen cover only the visible area and follow the magnification, up to a per-style limit. Backdrops stay still unless "Zoom the background too" is on.
- **Development features**: a `devFeatures` flag, true only under the Vite dev server, guards the lighting debug style and the styles' own options (deep summer's realism touches, botanical ink's stipple settings). The built site leaves out the debug style and uses each option's initial value.
- **Spatial indexing**: an incrementally updated uniform grid hash for nearest-node and birth-distance queries; `delaunator` triangulation rebuilt every step for closed venation. Both sit behind one interface and are tested against brute-force versions.

## Simulation

- Faithful to Runions et al. (2005). Auxin sources have **no influence radius**: every source influences its nearest vein node (open) or its relative neighbourhood (closed).
- Closed venation uses the **Urquhart neighbourhood** first; the exact relative neighbourhood comes later as an advanced toggle. A brute-force exact version exists from the start as a test oracle.
- **Deterministic** from (simulation parameters, random seed, model version) (ADR 0002).
- **Scale**: specimen parameters are stored relative to the final leaf length. **Detail** sets the length in vein segment lengths. A **node budget** (~100k vein nodes) ends a runaway simulation gracefully. Table 1 of the paper is a starting point for tuning, not gospel.
- **Growth**: the leaf length grows linearly from the initial size by the growth per step (both fractions of the final length). Simulation coordinates are those of the final leaf. Under marginal growth the blade is the final blade scaled about its base, and vein nodes and auxin sources never move. Under isogonic growth nothing moves either: the unit of distance shrinks instead (a vein segment length is 1 / size), as the paper does. Darts keep the same density per unit of leaf area at every size. Snapshots carry the blade and vein scales so the renderer can draw the current leaf.
- **Termination**: a growth phase until the final outline is reached, then a settling phase with no growth, until no auxin sources remain and no darts are accepted for several steps, or no vein node has been added for several steps, or the node budget is hit. A new vein node within a tiny distance of an existing one is rejected and counts as no progress, which stops vein nodes stuttering.
- **Deviations from the paper**. The first two apply only where the paper's rules make no progress; the third fills a gap in the paper:
  - When a node's sources nearly cancel (on opposite sides of it), the averaged step points sideways onto an earlier node. In that case only, the node grows one vein toward each source separately.
  - In closed venation, a tagged vein node that cannot grow (blocked by a node that already reached the source) is released, as if it had left the source's zone of influence.
  - **Anastomoses**: the paper says when loops form but not how meeting veins connect. When a closed-venation source is removed, every vein node that arrived at it is joined to the one closest to the source. "Arrived" covers nodes that came within the kill distance, tagged nodes blocked just short, and tagged nodes excluded from the source's neighbourhood by a vein that just arrived (rather than turning away). Joins are skipped between adjacent nodes and when longer than twice the kill distance plus one vein segment length on each side. The vein graph is a tree plus a list of anastomoses.
- **Kill distance** for closed venation defaults to the minimum, one vein segment length, as in every closed pattern in the paper; with a large kill distance closed venation looks just like open.
- **Vein width**: Murray's law with the vein width exponent as a render setting, computed on the growth tree. An anastomosis is drawn as a continuation of the finer of the two veins it joins.
- **Vein order**: the widest child continues its parent's order; the others take the next order. For closed venation it is computed on the growth tree.

## Leaf outlines and growth

- A leaf outline is a closed cubic Bézier margin path in normalised coordinates (base at the origin, tip along +y, length 1), plus zero or more **fenestration** paths, its initial vein nodes and a _symmetric_ flag.
- **Margin teeth** are procedural (summed triangular waveforms), applied to the final outline.
- The leaf outline is the **final** shape; the starting outline is derived by inverting the growth (ADR 0003). For marginal and isogonic growth that is just the outline scaled down about the base. A ghost outline of the final leaf is shown during growth, and the view always frames the final leaf.
- **Marginal growth** is only offered for outlines that are star-shaped from the base, checked automatically; the option is disabled with an explanation otherwise, and a selection falls back to isogonic growth. Lobed and fenestrated outlines can still use isogonic or anisotropic growth.
- **Fenestrations** use line of sight: a source only influences vein nodes it can see without crossing a fenestration, and new vein segments may not cross one. Fenestrations are present from the start and scale with the blade.
- Anisotropic growth types start with a few presets (e.g. elongating, widening, Arabidopsis developmental after Fig. 5 of the paper).

## Settings

- **Simulation parameters** restart the simulation, debounced to the end of a slider drag.
- **Render settings** (style, overlays, vein width exponent) re-render without restarting.
- **Playback** (speed, pause, scrub) never restarts.
- A **specimen** holds only leaf-defining simulation parameters. Random seed, detail and style sit outside it. A specimen may _suggest_ a style, applied only when it is picked fresh. Changing any specimen parameter deselects the specimen and the leaf becomes **custom**.
- The UI explains the random seed with a line of help text, since "seed" is otherwise ambiguous in a plant app.
- **First visit**: a random pick from a curated list of specimen and style pairings, already growing.

## Sharing

- Settings live in the URL fragment as readable short keys, updated live.
- An unmodified specimen link is a living reference (`#v=1&sp=ginkgo&rs=8f3a&detail=…&style=…`); a custom link lists every simulation parameter explicitly (ADR 0004). Render settings are always explicit.
- Links from an older model version open with the current model and a gentle notice.
- Exports: SVG and high-resolution PNG. A herbarium sheet and time-lapse video come later.

## Catalogues

- **Leaf outlines (16)**: linear, lanceolate, elliptic, ovate, obovate, oblong, spatulate, cordate, deltoid, orbicular, reniform, flabellate, palmately lobed, pinnately lobed, hastate, sagittate. Each gets a thumbnail generated in the current style.
- **Specimens**: the paper's ginkgo, lady's mantle, sweetgum, Nankin cherry, poplar, orchid, grass and Arabidopsis (developmental); then Monstera with the fenestration work; tuned-by-eye specimens later.
- **Styles (8)**: spring green, deep summer green, autumn, cyanotype, botanical ink, graphite study, technical study, skeleton leaf.
- **Overlays**: auxin sources with kill-distance circles; influence lines; growth direction arrows; Delaunay/Voronoi; relative-neighbourhood lune under the cursor; rejected darts; vein nodes; tagged vein nodes (closed venation). Each toggles independently; technical study enables several by default.

## Look and feel

- Coloured styles: rich colours, with a bokeh background of similarly shaped leaves (animated where performance allows, with parallax and wind as polish).
- Drawing styles: papery texture, with pencil or ink strokes (wobble, pressure variation).
- Spring green's blade shows **living mesophyll cells**: a power diagram of cell sites that appear as the leaf grows and fade out near veins, so cells end at the veins. A prototype, not yet satisfying.
- Veins are smooth curves through the vein nodes, tapering continuously, with clean joins where they branch.
- **Card stock panel**: a sheet of fine card with a subtle paper texture, embossed rules and letterpress headings; selected options are stamped in the style's accent colour, set by per-style CSS variables. (Glass, and then metallic foil, were tried and set aside.)
- **Typography**: EB Garamond (names and headings; botanical names in italics) and Inter (controls), self-hosted. Technical study uses a drafting-style font for annotations.
- Delights in the core plan: trace to base, timeline scrubber, PNG export, keyboard shortcuts with a `?` cheat sheet.

## Accessibility

Keyboard operable throughout with screen-reader labels; WCAG AA contrast on the panel; `prefers-reduced-motion` stops the bokeh animation and makes growth jump in larger steps; overlays use shape and dash as well as colour.

## Testing

1. Unit tests for geometry and growth maths.
2. fast-check property tests for invariants: vein nodes stay inside the blade; no auxin source is closer than the birth distance; no vein crosses a fenestration; growth then reverse growth returns the starting outline; open venation forms a tree.
3. **Golden tests**: fixed settings and random seed must produce an output identical to a stored hash. A failure means the model version must be bumped, or the change undone.
4. Playwright screenshot tests for styles, once they settle.
