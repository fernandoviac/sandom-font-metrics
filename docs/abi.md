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
