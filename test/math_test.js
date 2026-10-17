import { assert, assertEquals } from "@std/assert";

// Compares the WAT MATH reader with HarfBuzz hb-ot-math answers recorded by
// tools/record-math-fixtures.js, then fuzzes the table bytes.

async function runtime() {
  const bytes = await Deno.readFile(
    new URL("../dist/font-metrics.wasm", import.meta.url),
  );
  return (await WebAssembly.instantiate(bytes, {})).instance.exports;
}

function reader(wasm, bytes, slack = 0) {
  const font = wasm.font_metrics_alloc(bytes.length + slack);
  const result = wasm.font_metrics_alloc(1 << 20);
  const memory = () => new Uint8Array(wasm.memory.buffer);
  memory().set(bytes, font);
  const view = () => new DataView(wasm.memory.buffer);
  const length = bytes.length;
  const list = (status, header, size, fields) => {
    if (status !== 0) return { status };
    const v = view();
    const total = v.getUint32(result, true);
    const written = v.getUint32(result + 4, true);
    const entries = Array.from({ length: written }, (_, index) =>
      fields.map((_, field) =>
        v.getInt32(result + header + index * size + field * 4, true)
      ));
    return { status, total, entries, header: v.getInt32(result + 8, true) };
  };
  return {
    font,
    memory,
    constants() {
      const status = wasm.font_metrics_math_constants(font, length, 0, result);
      const v = view();
      return {
        status,
        values: Array.from(
          { length: wasm.font_metrics_math_constant_count.value },
          (_, index) => v.getInt32(result + index * 4, true),
        ),
      };
    },
    glyph(glyph) {
      const status = wasm.font_metrics_math_glyph(
        font,
        length,
        0,
        glyph,
        result,
      );
      const v = view();
      return {
        status,
        flags: v.getUint32(result, true),
        italic: v.getInt32(result + 4, true),
        topAccent: v.getInt32(result + 8, true),
        kernCounts: [0, 1, 2, 3].map((corner) =>
          v.getUint32(result + 12 + corner * 4, true)
        ),
      };
    },
    kern(glyph, corner, start = 0, capacity = 4096) {
      return list(
        wasm.font_metrics_math_kern(
          font,
          length,
          0,
          glyph,
          corner,
          start,
          capacity,
          result,
        ),
        8,
        8,
        [0, 1],
      );
    },
    variants(glyph, horizontal, start = 0, capacity = 4096) {
      return list(
        wasm.font_metrics_math_variants(
          font,
          length,
          0,
          glyph,
          horizontal,
          start,
          capacity,
          result,
        ),
        8,
        8,
        [0, 1],
      );
    },
    assembly(glyph, horizontal, start = 0, capacity = 4096) {
      return list(
        wasm.font_metrics_math_assembly(
          font,
          length,
          0,
          glyph,
          horizontal,
          start,
          capacity,
          result,
        ),
        16,
        20,
        [0, 1, 2, 3, 4],
      );
    },
  };
}

const fixture = async (name) =>
  JSON.parse(
    await Deno.readTextFile(new URL(`fixtures/${name}`, import.meta.url)),
  );

for (
  const name of [
    "math/STIXTwoMath.harfbuzz.json",
    "math/latinmodern-math.harfbuzz.json",
  ]
) {
  Deno.test(`MATH reader matches HarfBuzz for ${name}`, async () => {
    const wasm = await runtime();
    const expected = await fixture(name);
    const bytes = await Deno.readFile(
      new URL(`fixtures/${expected.font}`, import.meta.url),
    );
    const digest = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ].map((value) => value.toString(16).padStart(2, "0")).join("");
    assertEquals(digest, expected.sha256);
    const math = reader(wasm, bytes);
    const constants = math.constants();
    assertEquals(constants.status, 0);
    assertEquals(constants.values.slice(0, 56), expected.constants);
    assertEquals(constants.values[56], expected.minConnectorOverlap.vertical);
    assertEquals(constants.values[56], expected.minConnectorOverlap.horizontal);
    const extended = new Set(expected.extendedShape);
    let covered = 0;
    for (let glyph = 0; glyph < expected.glyphCount; glyph++) {
      const info = math.glyph(glyph);
      assertEquals(info.status, 0);
      // HarfBuzz answers 0 for an uncovered italic correction and half the
      // advance for an uncovered top-accent attachment.
      assertEquals(info.italic, expected.italicCorrection[glyph], `${glyph}`);
      if (info.flags & 2) {
        covered++;
        assertEquals(info.topAccent, expected.topAccentAttachment[glyph]);
      } else {
        assertEquals(info.topAccent, 0);
        assertEquals(
          expected.topAccentAttachment[glyph],
          expected.halfAdvance[glyph],
          `${glyph}`,
        );
      }
      assertEquals((info.flags & 4) !== 0, extended.has(glyph), `${glyph}`);
      const kernings = expected.kernings[glyph] ?? [[], [], [], []];
      for (let corner = 0; corner < 4; corner++) {
        assertEquals(info.kernCounts[corner], kernings[corner].length);
        if (!kernings[corner].length) continue;
        const kern = math.kern(glyph, corner);
        assertEquals(kern.status, 0);
        assertEquals(kern.total, kernings[corner].length);
        assertEquals(kern.entries, kernings[corner], `${glyph}/${corner}`);
      }
      for (const [direction, horizontal] of [["vertical", 0], ["horizontal", 1]]) {
        const variants = math.variants(glyph, horizontal);
        assertEquals(variants.status, 0);
        assertEquals(
          variants.entries,
          expected.variants[glyph]?.[direction] ?? [],
          `${glyph} ${direction}`,
        );
        const assembly = math.assembly(glyph, horizontal);
        assertEquals(assembly.status, 0);
        const parts = expected.assemblies[glyph]?.[direction];
        assertEquals(assembly.entries, parts?.parts ?? []);
        assertEquals(assembly.header, parts?.italicCorrection ?? 0);
      }
    }
    assert(covered > 0);
  });
}

Deno.test("list calls honour start and capacity", async () => {
  const wasm = await runtime();
  const expected = await fixture("math/STIXTwoMath.harfbuzz.json");
  const math = reader(
    wasm,
    await Deno.readFile(new URL(`fixtures/${expected.font}`, import.meta.url)),
  );
  const [glyph, { vertical }] = Object.entries(expected.assemblies).find((
    [, value],
  ) => value.vertical?.parts.length >= 3);
  const window = math.assembly(Number(glyph), 0, 1, 1);
  assertEquals(window.total, vertical.parts.length);
  assertEquals(window.entries, [vertical.parts[1]]);
  assertEquals(math.assembly(Number(glyph), 0, 99, 4).entries, []);
  assertEquals(math.variants(Number(glyph), 2).status, 7);
  assertEquals(math.kern(Number(glyph), 4).status, 7);
  assertEquals(math.variants(Number(glyph), 0, 0, 65537).status, 7);
});

Deno.test("a font without MATH answers the missing-table status", async () => {
  const wasm = await runtime();
  const expected = await fixture("metrics.harfbuzz.json");
  assertEquals(expected.hasMath, false);
  const math = reader(
    wasm,
    await Deno.readFile(new URL(`fixtures/${expected.font}`, import.meta.url)),
  );
  const tag = 0x4d415448;
  for (
    const call of [
      () => math.constants(),
      () => math.glyph(1),
      () => math.kern(1, 0),
      () => math.variants(1, 0),
      () => math.assembly(1, 1),
    ]
  ) {
    assertEquals(call().status, 3);
    assertEquals(wasm.font_metrics_error_field(), tag);
  }
});

// Locates the MATH table record of a single-face font.
function mathTable(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  const count = view.getUint16(4);
  for (let index = 0; index < count; index++) {
    const record = 12 + index * 16;
    if (view.getUint32(record) === 0x4d415448) {
      return {
        record,
        offset: view.getUint32(record + 8),
        length: view.getUint32(record + 12),
      };
    }
  }
  throw new Error("no MATH table");
}

// Every query a consumer makes, as one comparable answer.
function sweep(math, glyphs) {
  const answers = [math.constants()];
  for (const glyph of glyphs) {
    answers.push(math.glyph(glyph));
    for (let corner = 0; corner < 4; corner++) {
      answers.push(math.kern(glyph, corner));
    }
    for (const horizontal of [0, 1]) {
      answers.push(math.variants(glyph, horizontal));
      answers.push(math.assembly(glyph, horizontal));
    }
  }
  return answers;
}

Deno.test("malformed MATH tables return a status and read only the font span", async () => {
  const wasm = await runtime();
  const expected = await fixture("math/STIXTwoMath.harfbuzz.json");
  const original = await Deno.readFile(
    new URL(`fixtures/${expected.font}`, import.meta.url),
  );
  const table = mathTable(original);
  const glyphs = [
    ...Object.keys(expected.assemblies).slice(0, 6),
    ...Object.keys(expected.kernings).slice(0, 6),
    "0",
    "65535",
  ].map(Number);
  // The MATH table is moved to the end of the span so that a read past the
  // table is also a read past the font span. Poison after the span must never
  // change an answer.
  const relocated = new Uint8Array(original.length + table.length);
  relocated.set(original);
  relocated.set(
    original.subarray(table.offset, table.offset + table.length),
    original.length,
  );
  new DataView(relocated.buffer).setUint32(table.record + 8, original.length);
  let seed = 0x9e3779b9;
  const random = (limit) => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) % limit;
  };
  const statuses = new Set();
  for (let trial = 0; trial < 120; trial++) {
    const bytes = relocated.slice();
    const view = new DataView(bytes.buffer);
    if (trial % 3 === 0) {
      // Truncate the table record and the span together.
      const length = random(table.length);
      view.setUint32(table.record + 12, length);
      const span = bytes.subarray(0, original.length + length);
      const outcomes = [];
      for (const poison of [0x00, 0xff]) {
        const math = reader(await runtime(), span, 4096);
        math.memory().fill(poison, math.font + span.length, math.font + span.length + 4096);
        outcomes.push(sweep(math, glyphs));
      }
      assertEquals(outcomes[0], outcomes[1], `truncation ${length}`);
      for (const answer of outcomes[0]) statuses.add(answer.status);
      continue;
    }
    // Overwrite offsets and counts, half of them in the table headers.
    for (let edit = 0; edit < 8; edit++) {
      const at = original.length +
        random(edit % 2 ? table.length - 2 : Math.min(table.length - 2, 512));
      view.setUint16(at, random(2) ? 0xffff : random(0x10000));
    }
    const outcomes = [];
    for (const poison of [0x00, 0xff]) {
      const math = reader(await runtime(), bytes, 4096);
      math.memory().fill(poison, math.font + bytes.length, math.font + bytes.length + 4096);
      outcomes.push(sweep(math, glyphs));
    }
    assertEquals(outcomes[0], outcomes[1], `trial ${trial}`);
    for (const answer of outcomes[0]) statuses.add(answer.status);
  }
  for (const status of statuses) assert(status === 0 || status === 4, `${status}`);
  assert(statuses.has(4));
});
