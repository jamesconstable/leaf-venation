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

### A reactive framework can reset an input before you read it

Our slider kept a "draft" value while dragging. On release, the handler cleared the draft and then read the input's value. But clearing the draft made SolidJS synchronously re-render the input with the old value, so every slider silently ignored the user. The unit tests didn't cover the UI; a browser check found it within minutes.

## Language

### "Seed" means two things in a plant simulation

The paper's "seed vein node" and a random number generator's "seed" collide badly in an app about plants. We renamed the first to _initial vein node_ (also the paper's term) and always say _random seed_ for the second, with help text in the UI.
