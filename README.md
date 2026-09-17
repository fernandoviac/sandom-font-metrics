# @sandom/font-metrics

Status: local implementation complete. Publication and Sandom cutover remain.
The implementation follows the pure-WASM conventions proved by `@sandom/color`
and `@sandom/gain-map`.

This project owns bounded extraction of maintained metrics from OpenType font
bytes. It supports WebAssembly composition and a standalone WASM module without
taking ownership of shaping, fallback, font discovery, glyph generation, or
layout. The package and production source contain no JavaScript, TypeScript, or
`.d.ts` files. Tests and repository tools use JavaScript.

## Packages

- npm: `@sandom/font-metrics`
- GitHub target: `fernandoviac/sandom-font-metrics`
- local repository: `sandom-font-metrics`

## Boundaries

The result surface contains primitive metric values and precise parse errors.
Callers retain the font bytes. HarfBuzz and renderers remain separate consumers.

Repository-owned WebAssembly source must use `.wat` or `.watpart`. Build tooling
composes parts byte for byte and assembles them in process with
`tools/wat-assembler`, so the build needs no WABT on `PATH`; see
[the assembler provenance](docs/legal/wat-assembler.md). The package ships the
binary, the aggregate WAT, the build digest record, and the maintained parts
with their manifest; it contains no JavaScript, TypeScript, or `.d.ts` files.

See [DESIGN.md](DESIGN.md).
