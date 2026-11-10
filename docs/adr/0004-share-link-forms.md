# Share links: living specimen references, or fully explicit custom settings

A link to an unmodified specimen stores only the specimen's name (plus random seed, detail and render settings), so it is a _living reference_: if the specimen is later retuned, the link draws the retuned leaf. That's acceptable for someone sharing "a ginkgo in my favourite style". A link to a custom leaf stores _every_ simulation parameter explicitly, never as differences from a specimen or from global defaults, because those may change and silently alter a leaf someone tuned carefully. Only a model version bump can change what a custom link draws (see ADR 0002); in that case the app renders with the current model and shows a gentle notice.

## Considered Options

- **Differences from a specimen or defaults for every link**: shorter URLs, but any retuning breaks carefully tuned custom leaves.
- **Keep every past simulation version in the bundle**: exact reproduction forever, at a growing maintenance and bundle cost.
