# Composition

`src/font-metrics.manifest.json` is the ordering authority. The embeddable form
uses, in order:

1. `font-metrics-runtime.watpart`
2. `font-metrics-abi.watpart`
3. `font-metrics-reader.watpart`
4. `font-metrics-math.watpart`

The consumer declares one memory before these parts. The parts require the
symbol `memory`, reserve zero scratch bytes, do not allocate, do not call
`memory.grow`, and retain no font span after `font_metrics_read` returns. Calls
may share an instance without retained-state coordination. A host must not
mutate the input or result spans during a call.

The standalone form prepends `font-metrics-module.watpart`. It exports memory
and an aligned bump allocator for direct Deno and browser use.

`tools/build-wasm.js` reads the manifest, joins each component byte for byte
inside one module, assembles it with the vendored `tools/wat-assembler`, and
records source, aggregate, component, and binary SHA-256 values in
`dist/font-metrics.build.json`. The assembler's binding compiles every result
with `WebAssembly.compile`, which is the validation a separate `wasm-validate`
spawn used to provide. The tool never expands a template or emits source logic.
`--check` compares every output byte with the committed artifacts.
