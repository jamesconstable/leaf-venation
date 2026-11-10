# TypeScript (strict, functional style) rather than PureScript

The project owner prefers strongly-typed functional languages such as PureScript, but we chose TypeScript in strict mode. The simulation's hot loops over thousands of points want mutable typed arrays, and the work leans on libraries (Delaunay triangulation, WebGL, build and test tooling) that TypeScript gets for free and PureScript would need FFI bindings for. We recover most of the safety by writing a pure `step(state) → state` simulation core, immutable configuration types, discriminated unions and exhaustiveness checks. The simulation core's interface is kept narrow so it could be ported to Rust/WebAssembly later if profiling ever requires it.

## Considered Options

- **PureScript**: best type-system fit; rejected for hot-loop performance friction and a thin graphics/geometry ecosystem.
- **ReScript / OCaml (Melange)**: sound types and good interop, but a niche ecosystem.
- **Rust → WebAssembly core**: premature at this scale; adds JS↔WebAssembly boundary complexity.
- **PureScript UI + TypeScript core**: two toolchains and FFI everywhere for little gain.
