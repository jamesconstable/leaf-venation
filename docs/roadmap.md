# Roadmap

Each milestone is developed on its own branch with small, logical commits; tests run after every piece of work.

1. **Skeleton**: tooling and git hooks; `simulation/` core for open and closed venation with no growth; 3 leaf outlines; one plain style; auxin source and vein node overlays; unit, property and golden tests.
2. **Growth**: marginal and isogonic growth; detail; node budget; starting outline and ghost; playback.
3. **Beauty**: card stock panel; bokeh; paper textures; all eight styles; vein smoothing and widths.
   - **Decision point**: make the repo public and set up GitHub Actions CI and the Pages deploy?
4. **Catalogue**: all 16 leaf outlines; margin teeth; the eight paper specimens; thumbnails. Retune slider ranges and defaults: dense closed venation wants very high dart densities and very low birth distances, beyond the current ranges.
5. **Sharing**: URL codec; SVG and PNG export; keyboard shortcuts; timeline scrubber; trace to base.
6. **Anisotropy and fenestrations**: uniform and non-uniform anisotropic growth with presets; line-of-sight fenestrations; Monstera specimen.
7. **Extras**: herbarium sheet with fantasy botanical names; time-lapse export; gallery; placing auxin sources by hand; explain mode; custom outline editor.

## Backlog

- Exact relative neighbourhood as an advanced toggle.
- Remaining overlays: relative-neighbourhood lune under the cursor, triangulation, rejected darts (if not done in 1–5).
- Styles: herbarium sheet, stained glass, gold leaf / kintsugi, night bioluminescence.
- Tuned-by-eye specimens: oak, maple, beech, lime/linden, ….
- Start and end outline tweening for anisotropic growth (cf. Fig. 5 of the paper).
- Fenestrations that open partway through growth.
- Compound leaves as arrangements of leaflets.
- Parallax and wind on the bokeh background.
- Slower playback than one step per frame (e.g. one step every few frames): isogonic growth is most satisfying to watch at the slowest speed, and performance leaves plenty of headroom.
- Playwright screenshot tests for styles.
- Revisit the panel's styling: foil-stamped selections were tried and set aside for flat colour (see insights).
- Speed up the stippled ink style further: with the current defaults a full-size frame takes about 28 ms (from 64 ms), graphite about 23 ms, deep summer about 17 ms, spring green about 15 ms with living cells. About 10 ms of ink's time is its tone map (mostly the blurred fills for the folds, each with a high fixed cost), and 13 ms the blade's stippling. A stipple threshold done per pixel on the GPU (ordered dithering) would be far faster, but needs WebGL: Canvas 2D has no per-pixel threshold, and `context.filter` isn't supported in Safari.
- Living mesophyll cells: a prototype in spring green; decide whether to keep them, tune them, and extend them to the other styles with cell textures.
- Ink style: the finest veins fade into the brightest parts of the blade. Raising the stipple floor flattened the contrast, and stronger or wider shade beside narrow veins made them look lumpy. The lighting debug style shows the curl term dominates the tone (see insights), so taming it is the next thing to try.
- Remove the temporary lighting debug style before going public.
- Autumn's backdrop needs more experimenting: lighter and hazier, closer to the reference photo.
- Spring green, autumn: the petiole looks wider and paler than the midvein where it overlaps it inside the blade.
- Damage and skeletonisation as a setting for every style.
