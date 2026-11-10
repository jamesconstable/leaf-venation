# Leaf Venation

A browser demo that grows leaf venation patterns using the algorithms of Runions et al. (2005), and renders them in a range of visual styles.

## Leaf anatomy

**Leaf outline**:
The shape of a single simple leaf blade _at the end_ of the simulation, as chosen by the user, including its base, any fenestrations, and its initial vein nodes.
_Avoid_: Leaf shape (in code), contour, silhouette, final shape

**Starting outline**:
The shape of the blade at the start of the simulation, derived from the leaf outline by undoing the chosen growth.
_Avoid_: Initial shape, seed shape

**Fenestration**:
A hole enclosed within the blade, as in Monstera.
_Avoid_: Hole, perforation, window

**Margin teeth**:
Small regular protrusions added along the margin, described by amplitude and frequency rather than drawn.
_Avoid_: Serration (a specific tooth form), toothing

**Blade**:
The flat expanse of the leaf in which auxin sources and vein nodes live.
_Avoid_: Lamina, leaf area

**Margin**:
The edge of the blade.
_Avoid_: Border, edge, contour

**Base**:
The point where the blade attaches to the petiole; the origin of the venation.
_Avoid_: Root, stem point, attachment

## Simulation

**Auxin source**:
A point in the blade that attracts vein growth until veins come close enough to remove it.
_Avoid_: Attractor, hormone point, target

**Vein node**:
A point representing a short segment of vein; vein nodes are connected into a graph rooted at the seed vein nodes.
_Avoid_: Vertex, particle, branch point

**Initial vein node**:
A vein node present at the start of a simulation, usually a single node at the base (several along the base for parallel venation).
_Avoid_: Seed vein node, seed, root node

**Random seed**:
The number that, together with the settings, determines every random choice in a simulation, so the same random seed always grows the same leaf.
_Avoid_: Seed (on its own, which is ambiguous here)

**Detail**:
How many vein segment lengths long the leaf grows; higher detail gives finer veins and a slower simulation.
_Avoid_: Resolution, quality, scale

**Vein segment length**:
The fixed distance between a new vein node and its parent; the unit in which other distances are expressed.
_Avoid_: Step size, D

**Kill distance**:
The distance from an auxin source within which a vein node causes the source to be removed.
_Avoid_: Removal radius, dk

**Birth distance**:
The minimum distance a new auxin source must keep from existing sources and vein nodes.
_Avoid_: Spawn radius, bs, bv

**Dart density**:
The number of candidate auxin source positions tried per unit area of blade per step.
_Avoid_: Source rate, ρ, darts

**Influence**:
The relation by which an auxin source pulls a vein node toward it; the sources influencing a node determine the direction of its next growth.
_Avoid_: Attraction, association

**Open venation**:
A venation pattern in which veins branch but never rejoin, forming a tree.
_Avoid_: Tree pattern

**Closed venation**:
A venation pattern in which veins may rejoin (anastomose), forming loops.
_Avoid_: Network pattern, reticulate (which is a narrower botanical term)

**Anastomosis**:
A join between two veins that grew toward the same auxin source, closing a loop.
_Avoid_: Join, connection, merge, loop (a loop is the closed path an anastomosis creates)

**Relative neighbourhood**:
The set of vein nodes that an auxin source influences in closed venation: nodes close to the source but relatively far from one another.
_Avoid_: Neighbours, RNG

**Urquhart neighbourhood**:
A cheaper approximation of the relative neighbourhood.

**Vein order**:
The rank of a vein in the branching hierarchy: at each branch point the widest child continues its parent's order and the other children take the next order. The vein leaving the base is order 1.
_Avoid_: Strahler order, generation, level

**Vein width exponent**:
The exponent in Murray's law relating a parent vein's width to the widths of its children.
_Avoid_: n, Murray exponent

## Growth

**Growth type**:
How the blade expands during a simulation: no growth, marginal, isogonic, uniform anisotropic, or non-uniform anisotropic.
_Avoid_: Growth mode

**No growth**:
The blade keeps its size for the whole simulation.
_Avoid_: Fixed, static

**Marginal growth**:
The blade expands only at its margin; existing auxin sources and vein nodes stay where they are.

**Isogonic growth**:
The whole blade, including its veins and sources, expands equally in every direction.
_Avoid_: Uniform isotropic growth, scaling

**Uniform anisotropic growth**:
The whole blade expands at different rates in different directions, the same everywhere.

**Non-uniform anisotropic growth**:
The blade expands at rates that vary with direction and with position in the blade.

**Initial size**:
The leaf's length when a growing simulation starts, as a fraction of its final length.
_Avoid_: Starting scale, seed size

**Growth per step**:
How much the leaf's length increases each step, as a fraction of its final length.
_Avoid_: Growth rate, speed (which is playback)

**Ghost outline**:
A faint outline of the final leaf, shown while the leaf is still growing toward it.
_Avoid_: Target, preview

## Presentation

**Style**:
The complete visual treatment of a leaf and its background, e.g. autumn, cyanotype, botanical drawing.
_Avoid_: Theme, colour scheme, skin

**Specimen**:
A named bundle of simulation parameters that reliably produces a recognisable kind of leaf, e.g. ginkgo. Changing any of those parameters leaves the specimen behind: the leaf becomes custom.
_Avoid_: Preset (for this meaning), species, modified specimen

**Custom**:
Describes a leaf whose simulation parameters are not those of any specimen.
_Avoid_: Modified, user-defined

**Overlay**:
An optional visualisation of the algorithm's internals drawn over the leaf, e.g. auxin sources or influence lines.
_Avoid_: Debug view, algorithmic details

## Settings

**Simulation parameter**:
A setting whose change restarts the simulation.

**Render setting**:
A setting whose change re-renders the current venation without restarting it.

**Playback**:
Controls over how the simulation is presented in time (speed, pause, scrubbing), which never restart it.
_Avoid_: Draw speed (as a category)
