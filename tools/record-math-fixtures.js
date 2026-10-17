// Records the independent decoder's view of each MATH test font.
//
// HarfBuzz's hb-ot-math queries are the reference: this tool opens the
// system HarfBuzz through Deno FFI, creates each font at a scale equal to its
// units per em with no ppem (so values are font units and device-table deltas
// are ignored), and writes test/fixtures/math/<font>.harfbuzz.json.
//
//   deno run --allow-read --allow-write --allow-ffi tools/record-math-fixtures.js
//   SANDOM_HARFBUZZ=/path/to/libharfbuzz.dylib deno run ... (other library)
//
// The fixtures are evidence, not source logic: the test compares the WAT
// reader with them and never derives expected values itself.

const library = Deno.env.get("SANDOM_HARFBUZZ") ??
  "/opt/homebrew/lib/libharfbuzz.dylib";
const hb = Deno.dlopen(library, {
  hb_version_string: { parameters: [], result: "pointer" },
  hb_blob_create_from_file: { parameters: ["buffer"], result: "pointer" },
  hb_face_create: { parameters: ["pointer", "u32"], result: "pointer" },
  hb_face_get_glyph_count: { parameters: ["pointer"], result: "u32" },
  hb_face_get_upem: { parameters: ["pointer"], result: "u32" },
  hb_font_create: { parameters: ["pointer"], result: "pointer" },
  hb_font_get_glyph_h_advance: { parameters: ["pointer", "u32"], result: "i32" },
  hb_ot_math_has_data: { parameters: ["pointer"], result: "i32" },
  hb_ot_math_get_constant: { parameters: ["pointer", "i32"], result: "i32" },
  hb_ot_math_get_glyph_italics_correction: {
    parameters: ["pointer", "u32"],
    result: "i32",
  },
  hb_ot_math_get_glyph_top_accent_attachment: {
    parameters: ["pointer", "u32"],
    result: "i32",
  },
  hb_ot_math_is_glyph_extended_shape: {
    parameters: ["pointer", "u32"],
    result: "i32",
  },
  hb_ot_math_get_glyph_kernings: {
    parameters: ["pointer", "u32", "i32", "u32", "buffer", "buffer"],
    result: "u32",
  },
  hb_ot_math_get_min_connector_overlap: {
    parameters: ["pointer", "i32"],
    result: "i32",
  },
  hb_ot_math_get_glyph_variants: {
    parameters: ["pointer", "u32", "i32", "u32", "buffer", "buffer"],
    result: "u32",
  },
  hb_ot_math_get_glyph_assembly: {
    parameters: ["pointer", "u32", "i32", "u32", "buffer", "buffer", "buffer"],
    result: "u32",
  },
}).symbols;

const LTR = 4;
const TTB = 6;
const CONSTANTS = 56;
const fonts = [
  {
    file: "math/STIXTwoMath.otf",
    source: "macOS /System/Library/Fonts/Supplemental/STIXTwoMath.otf, STIX Two Math 2.13 b171",
    license: "SIL Open Font License 1.1 (math/STIXTwoMath-OFL.txt)",
  },
  {
    file: "math/latinmodern-math.otf",
    source: "https://www.gust.org.pl/projects/e-foundry/lm-math/download/latinmodern-math-1959.zip, otf/latinmodern-math.otf, version 1.959",
    license: "GUST Font License (math/latinmodern-math-GUST-FONT-LICENSE.txt)",
  },
  {
    file: "metrics.ttf",
    source: "repository-owned minimal OpenType fixture without a MATH table",
    license: "repository",
  },
];

const fixtures = new URL("../test/fixtures/", import.meta.url);
const cString = (text) => new TextEncoder().encode(`${text}\0`);
const version = Deno.UnsafePointerView.getCString(hb.hb_version_string());
const u32 = (value = 0) => new Uint32Array([value]);

function list(call, size, decode) {
  const count = u32(0);
  const total = call(0, count, new Uint8Array(0));
  if (total === 0) return [];
  count[0] = total;
  const bytes = new Uint8Array(total * size);
  call(0, count, bytes);
  const view = new DataView(bytes.buffer);
  return Array.from(
    { length: count[0] },
    (_, index) => decode(view, index * size),
  );
}

for (const entry of fonts) {
  const url = new URL(entry.file, fixtures);
  const bytes = await Deno.readFile(url);
  const digest = [
    ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  ].map((value) => value.toString(16).padStart(2, "0")).join("");
  const blob = hb.hb_blob_create_from_file(cString(url.pathname));
  const face = hb.hb_face_create(blob, 0);
  const font = hb.hb_font_create(face);
  const glyphCount = hb.hb_face_get_glyph_count(face);
  const record = {
    kind: "sandom/font-metrics-math-fixture",
    decoder: `HarfBuzz ${version} hb-ot-math, scale = units per em, ppem 0`,
    font: entry.file,
    sha256: digest,
    source: entry.source,
    license: entry.license,
    upem: hb.hb_face_get_upem(face),
    glyphCount,
    hasMath: hb.hb_ot_math_has_data(face) !== 0,
  };
  if (record.hasMath) {
    record.constants = Array.from(
      { length: CONSTANTS },
      (_, index) => hb.hb_ot_math_get_constant(font, index),
    );
    record.minConnectorOverlap = {
      horizontal: hb.hb_ot_math_get_min_connector_overlap(font, LTR),
      vertical: hb.hb_ot_math_get_min_connector_overlap(font, TTB),
    };
    record.italicCorrection = [];
    record.topAccentAttachment = [];
    record.halfAdvance = [];
    record.extendedShape = [];
    record.kernings = {};
    record.variants = {};
    record.assemblies = {};
    for (let glyph = 0; glyph < glyphCount; glyph++) {
      record.italicCorrection.push(
        hb.hb_ot_math_get_glyph_italics_correction(font, glyph),
      );
      record.topAccentAttachment.push(
        hb.hb_ot_math_get_glyph_top_accent_attachment(font, glyph),
      );
      record.halfAdvance.push(
        Math.trunc(hb.hb_font_get_glyph_h_advance(font, glyph) / 2),
      );
      if (hb.hb_ot_math_is_glyph_extended_shape(face, glyph)) {
        record.extendedShape.push(glyph);
      }
      const kernings = [0, 1, 2, 3].map((corner) =>
        list(
          (start, count, out) =>
            hb.hb_ot_math_get_glyph_kernings(
              font,
              glyph,
              corner,
              start,
              count,
              out,
            ),
          8,
          (view, at) => [view.getInt32(at, true), view.getInt32(at + 4, true)],
        )
      );
      // HarfBuzz answers zero entries for a corner without a MathKern.
      if (kernings.some((entries) => entries.length)) {
        record.kernings[glyph] = kernings;
      }
      for (const [name, direction] of [["vertical", TTB], ["horizontal", LTR]]) {
        const variants = list(
          (start, count, out) =>
            hb.hb_ot_math_get_glyph_variants(
              font,
              glyph,
              direction,
              start,
              count,
              out,
            ),
          8,
          (view, at) => [view.getUint32(at, true), view.getInt32(at + 4, true)],
        );
        if (variants.length) {
          (record.variants[glyph] ??= {})[name] = variants;
        }
        const italic = new Int32Array(1);
        const parts = list(
          (start, count, out) =>
            hb.hb_ot_math_get_glyph_assembly(
              font,
              glyph,
              direction,
              start,
              count,
              out,
              new Uint8Array(italic.buffer),
            ),
          20,
          (view, at) => [
            view.getUint32(at, true),
            view.getInt32(at + 4, true),
            view.getInt32(at + 8, true),
            view.getInt32(at + 12, true),
            view.getUint32(at + 16, true),
          ],
        );
        if (parts.length) {
          (record.assemblies[glyph] ??= {})[name] = {
            italicCorrection: italic[0],
            parts,
          };
        }
      }
    }
  }
  const name = entry.file.replace(/\.[a-z]+$/, ".harfbuzz.json");
  await Deno.writeTextFile(
    new URL(name, fixtures),
    JSON.stringify(record) + "\n",
  );
  console.log(
    JSON.stringify({
      font: entry.file,
      hasMath: record.hasMath,
      glyphCount,
      kernings: Object.keys(record.kernings ?? {}).length,
      variants: Object.keys(record.variants ?? {}).length,
      assemblies: Object.keys(record.assemblies ?? {}).length,
    }),
  );
}
