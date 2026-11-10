# Leaf venation browser demo

 * Implement the leaf venation algorithms in Runions et al, 2005 (`venation.sig2005.pdf`, located in the project root).
 * The UI should show a range of options down the left side of the screen:
   * Leaf shape, labelled by an image and the relevant technical name.
     * Not restricted to just the options presented in the paper. Other well-known leaf shapes should be included.
     * Not required in the first iteration, but we should think about letting the user input their own shape by painting, editing a spline, or similar.
   * Growth type (fixed, marginal, uniform isotropic, etc.) For the anisotropic options that have more parameters, we can start with a few simple presets.
   * Colour theme/style. Standard options like a few shades of green and autumn colouration, but also cyanotype, botanical drawing, technical study, etc.
   * Some preset options that auto-select multiple settings to reliably produce specific leaf types, e.g. ginkgo.
   * Options to hide/show algorithmic details during execution, e.g. auxin sources, neighbourhood calculation, etc.
   * Options to vary other relevant parameters of the simulation, e.g. draw speed.
   * When an option is changed in a way that is compatible with the current drawing (e.g. changing the colour scheme), the image adapts without repeating the simulation, but if something more fundamental changes (like the leaf shape), the simulation immediately restarts.
 * The main region of the screen is used as the drawing area for the simulation. We can use either SVG or WebGL for the drawing, whichever produces the best result.
 * There should be a strong focus on beauty and delighting the user. This should not look like a half-hearted browser demo.
   * Coloured themes should use rich colours, with a bokeh background effect that suggests dappled light through similarly-shaped leaves. Animation would be nice, if practical from a performance perspective.
   * Drawing themes should have a papery background texture, with lines and shading that look like they were drawn with pencil or ink.
   * Other styles should include appropriate skeuomorphic details that match their form.
   * The configuration options should overlay the background, using a liquid glass style. Err on the side of flatter and more opaque, with minimal distortion/refraction effects. When an option is selected, it looks as though it is lit from behind, with surrounding elements showing hints of colour. Use colours from the selected theme.
   * Please think about and suggest other delightful details and affordances.
 * I would like to avoid any backend frameworks; this is something that we should be able to host statically using GitHub pages.
 * Think about ways for users to share their work, e.g. saving an SVG, sharing a URL that contains the setting to redraw their leaf when opened.
 * Do all work in the current repo, working on branches when adding significant features, and making small logical commits. Keep code modular, e.g. separating simulation logic from drawing logic, and thinking about how to make testing straightforward. Write unit tests, and run these tests after completing any work to prevent regressions.
 * I'm not familiar with modern web technologies, so please suggest tools as appropriate, with pros and cons if there are multiple. Favour options where mistakes can be caught early through type systems, or similar mechanisms.
 * I have a preference for stongly-typed functional languages like PureScript, but am open to suggestions, and am interested in discussing pros and cons with you. We can also select a compile-to-WebAssembly option if necessary for performance reasons.
