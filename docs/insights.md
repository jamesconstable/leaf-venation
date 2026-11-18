# Insights

Interesting or surprising things learnt while building this project, collected for a write-up at the end. Each entry says what we found, how we found it, and what we did about it.

## The algorithm

### Auxin sources on opposite sides of a vein node deadlock the paper's growth rule

A vein node grows one step along the _average_ direction to the sources influencing it (Runions et al. 2005, Equation 1). When two sources sit on nearly opposite sides of the node, their unit vectors almost cancel (we measured a summed length of about 0.02–0.03), so the average points sideways, typically onto a node grown in an earlier step. The paper's rule then makes no progress forever, and the sources are never reached. We found it because the first browser run showed pairs of auxin sources stranded either side of veins. Before the fix, 15 runs on each of three outlines stranded 24–324 sources per outline and venation type (817 in total); afterwards, none in 600 random seeds. The fix only applies where the paper's rule is stuck: the node grows one vein toward each source separately, i.e. two opposing auxin flows produce two veins.

### Closed venation has a second deadlock in its tagging rule

In closed venation a source survives until every vein growing toward it has "reached it or left its zone of influence". A vein can stop just outside the kill distance (we saw 1.04 vein segment lengths against a kill distance of 1) when its next step would land almost on top of a node from the other vein, which already reached the source. It neither reaches the source nor leaves, so the source waits forever. We release a tagged vein that cannot grow, treating it like one that left.

### Closing a loop is not the same as joining veins

The paper describes when closed venation loops _form_ (several veins growing toward one source) but not how the meeting veins become one vessel. Taken literally, both veins stop within the kill distance of the source, 1–4 vein segment lengths apart, and nothing connects them. Measured on one ovate leaf, 61 of 143 vein tips ended within 1.5 vein segment lengths of another vein without being connected. Drawn faithfully, those loops look open, and that is how the problem showed up: in testing, no combination of settings seemed to produce closed venation. The paper's figures show joined loops, so some explicit joining step must have existed in the original implementation, or arose from its rendering.

We added explicit **anastomoses**: when a source is removed, the veins that arrived at it are joined. Afterwards every one of those 61 touching tips was joined, and joins were short (median 0.96, maximum 1.9 vein segment lengths).

A second, subtler cause of gaps: the paper releases a tagged vein when it "leaves the source's zone of influence". But once the first vein's tip sits right at the source, it often _excludes_ the second vein from the source's relative neighbourhood, so the second vein counts as having left and stops a few vein segment lengths short, although it never turned away. Counting such veins as arrived too raised the joined near misses (tips 1.5–4 vein segment lengths from another vein) from 21 to 85 of 206 on a denser leaf. The remaining near misses look like the free-ending veinlets real closed venation also has, which the paper lists as future work.

### Closed venation needs a tiny kill distance

With the kill distance at 8 vein segment lengths, closed venation is indistinguishable from open: 1 of 75 vein tips touched another vein. A source is tagged as soon as the first vein comes within the kill distance, and the other veins stop long before they could meet. Every closed pattern in the paper's Table 1 uses a kill distance of exactly 1 vein segment length.

### Urquhart's approximation is a strict superset of the relative neighbourhood

The relative neighbourhood graph is a subgraph of the Urquhart graph, which is a subgraph of the Delaunay triangulation. So the cheap approximation can only ever _add_ influenced vein nodes, never miss one. That makes a brute-force exact relative neighbourhood an ideal test oracle: a property test checks containment on random point sets.

### Delaunay neighbours of a point, without inserting it

The paper inserts each source into the Delaunay triangulation of the vein nodes to find its neighbours. The same answer comes from the Bowyer–Watson "cavity": the triangles whose circumcircles contain the source. Their vertices are exactly the neighbours it would have. The cavity always includes a triangle around the nearest vein node, so a short flood fill from there finds it, and one triangulation per step serves every source. Four distant "ghost" corners keep every source inside the triangulation, even when there are only one or two vein nodes.

### The paper's leaves are enormous

Table 1 measures everything in vein segment lengths, and some leaves are huge: the ginkgo grows to 50,000 vein segment lengths long, which implies millions of vein nodes. That's infeasible to animate in a browser, so parameters are stored relative to leaf length and a "detail" setting chooses the leaf length in vein segment lengths.

### Why marginal growth fails for dissected leaves

The paper notes in passing that marginal growth (scaling the margin about the base) "may gradually erode parts of the leaf blade" for dissected leaves. The precise condition is that the outline must be star-shaped from the base: every straight line from the base to the margin stays inside the blade. Otherwise veins laid down early end up outside the later blade. Fenestrated outlines fail the same test, since lines from the base cross the holes.

### The non-uniform growth model can be run backwards

We wanted users to choose the leaf's _final_ shape, which means inverting growth to get the starting shape. That sounds fragile, but the paper's non-uniform model makes growth rates depend only on a point's initial y coordinate, and its vertical displacement is a monotone integral already tabulated for the forward direction. The same lookup table runs it backwards (ADR 0003).

### Isogonic growth fits the "final shape" coordinates naturally

Under isogonic growth the paper doesn't move any points: it shrinks the unit of distance instead (λₜ = λ₀σ₀/σₜ). Read the other way round, the simulation runs in the coordinates of the _final_ leaf, where a vein segment length starts long and shrinks to 1 as the leaf reaches full size. Those are exactly the coordinates in which users define the leaf outline (ADR 0003), so the growth model and the "outline is the final shape" decision line up without any conversion. It also means veins laid down early are stretched as the leaf grows, which shows as long, straight early veins.

## Engineering

### Golden tests make refactoring safe

Adding growth touched nearly every line of the simulation step: distances gained a unit, blade tests gained a scale, and the step order changed. The no-growth golden fingerprints were byte-for-byte unchanged afterwards, which is strong evidence the refactor preserved the existing behaviour exactly; the new growth tests then only had to cover what was new.

### TypeScript narrows annotated constants

`const noGrowth: Growth = { type: "none" }` looks like a value of the whole `Growth` union, but TypeScript narrows it to the `{ type: "none" }` member from its initialiser. A default parameter `growth = noGrowth` then only accepted "no growth", and every test passing marginal or isogonic growth failed to type check. The fix is to annotate the parameter itself (`growth: Growth = noGrowth`). It also exposed a gap in our safeguards: only format and lint ran before each commit, so a commit with a type error went through. The pre-commit hook now type checks too.

### Bit-identical results across browsers rule out some of `Math`

Shared links must reproduce a leaf exactly. IEEE 754 requires `+ - * /` and `Math.sqrt` to be correctly rounded, so they give identical results everywhere, but `Math.hypot`, `Math.sin`, `Math.exp` and friends carry no such guarantee and do vary between JavaScript engines. A lint rule bans them, and `Math.random`, from simulation code.

### Golden tests catch accidental changes to the model

A test fingerprints the complete output of two fixed simulations. It caught the deadlock fix above, which was correct and intended but changed results. That is exactly the signal for deciding whether shared links need a new model version.

### Bokeh without WebGL

The plan assumed animated bokeh would need WebGL shaders. Instead, each layer of out-of-focus foliage is painted at a tenth to a third of screen resolution, blurred in a few milliseconds at that size, and scaled up by the browser, which softens it further for free. Drifting the layers with CSS transforms lets the GPU compositor animate them at no cost to the main thread, so the simulation keeps the whole frame budget. A plain bilinear upscale alone left blocky artefacts; the small blur first is what makes it look like a lens.

### `isPointInPath` ignores the canvas transform

The stippled shading in the botanical ink style tested each candidate dot with `context.isPointInPath(blade, x, y)` and drew nothing at all. The path is interpreted through the context's current transform (scaled by the device pixel ratio on a high-density display), but the point is not: it's in raw canvas pixels. On a 2× display every test missed. Testing against our own polygon in the same coordinates fixed it, and is independent of the display.

### Blurring a thin line dilutes it to nothing

The soft shadows beside veins were first drawn as the blurred shadow of each vein's own shape, and were all but invisible: blurring spreads a line one or two pixels wide over many more, so its peak darkness collapses. The fix was to blur a shape several times wider than the vein, and to lay the shadow down twice. The same applies to any glow or halo built from a canvas shadow.

### Two coordinate systems, one type

The style swatches drew stray straight lines across their miniature leaves. They had been given the blade at leaf length 1, while vein positions are in simulation units, 200 times larger, so nearly every vein was drawn far off the swatch and the midvein appeared as a long line. Both values had the type `Region`. A _branded_ type for each coordinate system (normalised, simulation and screen) would have turned this into a compile error; a candidate for later.

### Convincing foil is harder than it looks

CSS foil for the options panel went through several versions: a diagonal gradient (read as just that), then narrow highlight bands with a crinkled grain (an earlier grain varied only in transparency over mid-grey, which a soft-light blend leaves unchanged), pinned to the window with `background-attachment: fixed` and shifted as the pointer moved, so every pill showed a different part of the same light. It was clever but didn't survive review: the range of brightness made text on the foil unreadable in places, the pieces still didn't look lit by one light, the light moved only sideways and froze when the pointer left the panel, and repainting fixed backgrounds lagged slightly. Flat colour replaced it for now.

### Hold a drawing's tone steady as the leaf grows

Stipple dots are placed on a lattice fixed to the final leaf, so they travel with the leaf as it grows instead of shimmering. But then a small leaf squeezes every dot into a fraction of the area, and looks far darker than the full-grown one (the whole final drawing, shrunk). Giving each candidate dot a random rank, and drawing only those ranked below the square of the blade's current scale, keeps the dots per pixel, and so the tone, constant: as the leaf grows, new dots appear between the old ones.

### Shade derived from one chosen feature flickers as the choice changes

The ink style first shaded the half of the blade beyond the midvein, choosing the midvein afresh each frame as the widest first-order vein. Near the tip, two growing veins took turns being widest, and the shading there flipped between light and dark. It also looked unnatural, like a yin-and-yang symbol. Folding the blade a little along every vein instead (each casting graded shade to one side, reaching further for wider veins), plus slopes of a gentle noise surface fixed to the leaf, gives richer relief with no single choice to flip.

### Hash the pixels to prove a refactor changed nothing

Pulling shared code out of the approved styles risked changing how they look, in ways too subtle to spot by eye. Hashing the canvas's pixels for a fixed random seed before and after each refactor (SHA-256 over `getImageData`) proved the output pixel-identical. It's a cheap stand-in for screenshot tests while those wait in the backlog.

### Draw texture after shading to keep it visible in the shade

The leaf's cell texture was laid down before the soft shadows beside the veins, which then hid it. Applied after the shadows with an `overlay` blend, the same texture modulates whatever is beneath it, so the cell walls carry on through the shaded bands.

### Measure each lighting term before tuning any of them

The ink style's tone is the sum of several terms: an overall gradient and the margin curving away, folds along the veins, each vein's relief, and the "curl" (slopes of a noise surface). A debug style showing each term in its own colour channel, all at one gain, revealed that the curl swamps the rest. It swings darkness by ±0.35 or more across the blade, against about ±0.06 for the folds and the gradient. At its scale the noise surface is a single broad tilt, so it alone makes the dark left half and bright right half, including the bright patch where fine veins fade. Folding along every vein had seemed to fix the yin-and-yang look, but the curl brought back a milder version of it.

### Measure canvas work where it actually happens

Timing ink's phases with `performance.now()` pointed at the wrong culprits at first. Canvas drawing is queued for the GPU, so a phase that only issues commands looks cheap and the cost turns up later, wherever something waits for the GPU: reading the tone map back with `getImageData` took 14 ms, almost all of it waiting for blurs queued just before. Painting at lower resolution barely changed it, while painting on a CPU-backed canvas (`willReadFrequently`) just moved the same cost into the blurs. The stipple loop's cost was building the path, not the per-dot maths: tens of thousands of `arc` calls took about 15 ms, so caching the noise per dot saved almost nothing until the dots were written straight into pixels. Frame intervals from `requestAnimationFrame` also mislead, since they snap to whole display frames (16.7, 33.3, 50 ms), and runs with different random seeds aren't comparable. Timing the style's whole draw call, with a fixed seed, gave trustworthy numbers.

### Check that a cache actually hits

Caching each stipple mark's curl seemed to save nothing, which wrongly suggested the curl wasn't costly. In fact the cache never hit: the vein stipple pass asked for it with a different random seed, evicting the blade's entry every frame. Fetching it only for the blade took ink from 38 ms to 29 ms a frame. Each blurred shadow fill also turned out to have a high fixed cost, regardless of the canvas's resolution, so painting folds with two wide offsets instead of four narrow ones saved more than halving their resolution had.

### Zoom by magnifying the drawing, not by redrawing it bigger

The first leaf zoom drew the leaf into a larger frame. Lines stayed sharp, but every mark sized in screen pixels (stipple dots, pen widths, cell textures) stayed the same size, so zooming in showed a denser, finer drawing rather than a closer look at the same one. It was also slow, since ink stippled the whole enlarged leaf, offscreen parts included. Magnifying through the canvas's transform instead enlarges everything together and keeps vector marks sharp. The remaining work was in the bitmaps styles paint offscreen (tone maps, the summer lighting, the living cells): these now cover only the visible area and follow the magnification, up to a limit for the costliest.

### Cells shaped by veins: remove the sites, and wall off the veins

To make mesophyll cells end at veins rather than lie across them, three fixes fell short in turn. Shrinking cell sites near a vein let cells from the far side spill across. Pushing sites off veins piled them up between closely spaced fine veins, leaving gaps the veins filled. Walling each cell off from its nearest vein still let veins slice through cells, because each wall was a single 3-pixel piece of vein and cells simply reached around its ends. The user's suggestion from Worley noise, removing (here, fading out) the sites nearest a vein so their neighbours' walls meet along it, combined with walls that follow the vein for a cell's whole reach, fixed the cells themselves, but veins still appeared to run through cell centres. Colouring each cell's pixels by owner finally showed why: each vein claimed a band of pixels about a cell wide on either side, left to it once the nearby sites faded, and shaded like a cell that band read as a long cell with the vein down its middle. Limiting a vein's territory to its own width fixed it. The lesson is to look at what the algorithm assigns, not at the shaded result. An interactive walkthrough of each attempt, at three times the scale, made the approach explainable where prose had failed.

### A reactive framework can reset an input before you read it

Our slider kept a "draft" value while dragging. On release, the handler cleared the draft and then read the input's value. But clearing the draft made SolidJS synchronously re-render the input with the old value, so every slider silently ignored the user. The unit tests didn't cover the UI; a browser check found it within minutes.

## Language

### "Seed" means two things in a plant simulation

The paper's "seed vein node" and a random number generator's "seed" collide badly in an app about plants. We renamed the first to _initial vein node_ (also the paper's term) and always say _random seed_ for the second, with help text in the UI.
