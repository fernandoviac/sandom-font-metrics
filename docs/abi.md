# ABI

ABI version 1 exports `font_metrics_abi_version()` and the immutable global
`font_metrics_abi_version_global`.

## Operations

`font_metrics_read(font, length, face, groups, result) -> status`

- `font` and `length` name a bounded OpenType byte span in module memory.
- `face` is zero for a standalone sfnt or an index into a `ttcf` collection.
- `groups` combines BASE (1), ZERO (2), and TYPO (4). Zero is valid and reads
  the required `head` and `hhea` fields only.
- `result` names 80 writable bytes. The function clears the record before
  parsing and returns zero on success or an error code.
- The function retains no pointer or state and never grows memory.

The standalone form also exports `memory` and
`font_metrics_alloc(size) -> pointer`. Allocation is an aligned bump operation;
there is no release operation.

`font_metrics_error_code() -> code` and `font_metrics_error_field() -> field`
return the last operation failure. A successful read clears both.

## Errors

| Code | Export                             | Field                        |
| ---: | ---------------------------------- | ---------------------------- |
|    1 | `font_metrics_error_span`          | invalid pointer              |
|    2 | `font_metrics_error_face_index`    | requested face               |
|    3 | `font_metrics_error_missing_table` | big-endian table tag         |
|    4 | `font_metrics_error_font_data`     | byte offset in the font span |
|    5 | `font_metrics_error_groups`        | group mask                   |
|    6 | `font_metrics_error_allocation`    | requested byte count         |
|    7 | `font_metrics_error_argument`      | rejected argument value      |

All malformed input returns an error; it does not trap.

## Result

Every offset below is also exported as `font_metrics_result_<name>_offset`; size
80 is exported as `font_metrics_result_size`.

| Offset | Type | Name                |
| -----: | ---- | ------------------- |
|      0 | u32  | groups              |
|      4 | u32  | upem                |
|      8 | i32  | ascender            |
|     12 | i32  | descender           |
|     16 | i32  | line_gap            |
|     20 | i32  | underline_position  |
|     24 | i32  | underline_thickness |
|     28 | i32  | strikeout_position  |
|     32 | i32  | strikeout_thickness |
|     40 | f64  | zero_advance_ratio  |
|     48 | i32  | typo_ascender       |
|     52 | i32  | typo_descender      |
|     56 | i32  | typo_line_gap       |
|     60 | u32  | win_ascent          |
|     64 | u32  | win_descent         |
|     68 | i32  | x_height            |
|     72 | i32  | cap_height          |
|     76 | u32  | fs_selection        |

All record fields use WebAssembly little-endian memory. Font fields are decoded
from OpenType big-endian bytes. `x_height` and `cap_height` are zero when the
`OS/2` version is below 2 or the table is shorter than 90 bytes.

## MATH table

Five operations read the OpenType `MATH` table. Each takes the same `font`,
`length`, and `face` as `font_metrics_read`, clears its record, returns zero or
an error code, and never grows memory. A face without `MATH` returns 3 with the
field `0x4d415448`. A `MATH` major version other than 1 returns 4. Values are
font units; device-table deltas are ignored. A null subtable offset reads as
an absent subtable.

`font_metrics_math_constants(font, length, face, result) -> status` writes
228 bytes (`font_metrics_math_constants_size`): 57 `i32` values
(`font_metrics_math_constant_count`). Index 0 to 55 follow the `MathConstants`
field order, which is also the `hb_ot_math_constant_t` order, from
`ScriptPercentScaleDown` to `RadicalDegreeBottomRaisePercent`. Index 56 is
`MathVariants.minConnectorOverlap`.

`font_metrics_math_glyph(font, length, face, glyph, result) -> status` writes
32 bytes (`font_metrics_math_glyph_size`):

| Offset | Type   | Name                                            |
| -----: | ------ | ----------------------------------------------- |
|      0 | u32    | flags                                           |
|      4 | i32    | italic correction                               |
|      8 | i32    | top-accent attachment                           |
|     12 | u32[4] | kern entry counts: top right, top left, bottom right, bottom left |

Flags: italic correction covered (1, `font_metrics_math_glyph_italic`),
top-accent attachment covered (2, `font_metrics_math_glyph_top_accent`),
extended shape (4, `font_metrics_math_glyph_extended_shape`), and at least one
math kern (8, `font_metrics_math_glyph_kerning`). An uncovered value is zero;
HarfBuzz substitutes half the advance for an uncovered top-accent attachment,
and the caller owns that default.

The three list operations take `start` and `capacity` (0 to 65536 entries) and
write a header followed by at most `capacity` entries from entry `start`. Header
offset 0 is the total entry count (u32) and offset 4 the written count (u32).

- `font_metrics_math_kern(font, length, face, glyph, corner, start, capacity,
  result)`: `corner` 0 to 3 in the order above; header 8 bytes; entries of 8
  bytes: maximum correction height (i32, `0x7fffffff` for the last entry) and
  kern value (i32).
- `font_metrics_math_variants(font, length, face, glyph, horizontal, start,
  capacity, result)`: `horizontal` 0 or 1; header 8 bytes; entries of 8 bytes:
  variant glyph (u32) and advance measurement (i32).
- `font_metrics_math_assembly(font, length, face, glyph, horizontal, start,
  capacity, result)`: header 16 bytes, with the assembly italic correction (i32)
  at offset 8; parts of 20 bytes: glyph (u32), start connector length, end
  connector length, full advance (i32 each), and part flags (u32; extender is
  1, `font_metrics_math_part_extender`).

A `corner`, `horizontal`, or `capacity` outside its range returns 7. A result
span shorter than the header plus `capacity` entries returns 1.
`test/math_test.js` compares every operation with HarfBuzz `hb-ot-math`
answers recorded by `tools/record-math-fixtures.js` for STIX Two Math, Latin
Modern Math, and `metrics.ttf` (no `MATH`), and fuzzes table offsets and counts:
a malformed table returns a status and never reads outside the font bytes.
Sandom's MathML layout composes these operations into its renderer core and
reads the records in WAT.
