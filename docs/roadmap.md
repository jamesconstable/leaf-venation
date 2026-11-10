# Roadmap

Each milestone is developed on its own branch with small, logical commits; tests run after every piece of work.

1. **Skeleton**: tooling and git hooks; `simulation/` core for open and closed venation with no growth; 3 leaf outlines; one plain style; auxin source and vein node overlays; unit, property and golden tests.
2. **Growth**: marginal and isogonic growth; detail; node budget; starting outline and ghost; playback.
3. **Beauty**: glass panel; bokeh; paper textures; all eight styles; vein smoothing and widths.
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
