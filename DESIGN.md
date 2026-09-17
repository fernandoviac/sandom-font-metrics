# Design

## Surface

The library accepts a bounded font byte span, face index, and group mask. It
returns a primitive record: units-per-em, `hhea` and `OS/2` vertical metrics,
underline and strikeout metrics, the zero-glyph advance ratio, and a stable
error code with the failing field. Record layout, group bits, and error codes
are exported as immutable WebAssembly globals; `docs/abi.md` is the written
contract.

## Runtime forms

An embeddable WAT part operates on a consumer's memory below
`$FONT_METRICS_BASE` and never allocates or grows memory. A standalone WASM
build adds private memory and an allocator and exposes the same functions to
Deno and browser callers. The parser owns no font registry and retains no font
bytes after a call. Both forms build from one manifest-ordered source tree.

## Exclusions

The project does not shape text, choose fallback fonts, normalize CSS values,
generate glyphs, or perform layout.
