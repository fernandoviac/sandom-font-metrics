import { assertAlmostEquals, assertEquals } from "@std/assert";

async function runtime() {
  const bytes = await Deno.readFile(
    new URL("../dist/font-metrics.wasm", import.meta.url),
  );
  const { instance } = await WebAssembly.instantiate(bytes, {});
  return instance.exports;
}

async function readFixture(wasm, name, face = 0, groups = 7) {
  const bytes = await Deno.readFile(
    new URL(`fixtures/${name}`, import.meta.url),
  );
  const font = wasm.font_metrics_alloc(bytes.length);
  const result = wasm.font_metrics_alloc(wasm.font_metrics_result_size.value);
  new Uint8Array(wasm.memory.buffer, font, bytes.length).set(bytes);
  const status = wasm.font_metrics_read(
    font,
    bytes.length,
    face,
    groups,
    result,
  );
  return {
    bytes,
    font,
    result,
    status,
    view: new DataView(wasm.memory.buffer),
  };
}

Deno.test("standalone returns exact base, advance, and OS/2 metrics", async () => {
  const wasm = await runtime();
  assertEquals(wasm.font_metrics_abi_version(), 1);
  const { result, status, view } = await readFixture(wasm, "metrics.ttf");
  assertEquals(status, 0);
  assertEquals(view.getUint32(result, true), 7);
  assertEquals(view.getUint32(result + 4, true), 1000);
  assertEquals(view.getInt32(result + 8, true), 800);
  assertEquals(view.getInt32(result + 12, true), -200);
  assertEquals(view.getInt32(result + 16, true), 200);
  assertEquals(view.getInt32(result + 20, true), -75);
  assertEquals(view.getInt32(result + 24, true), 50);
  assertEquals(view.getInt32(result + 28, true), 300);
  assertEquals(view.getInt32(result + 32, true), 40);
  assertAlmostEquals(view.getFloat64(result + 40, true), 0.6);
  assertEquals(view.getInt32(result + 48, true), 750);
  assertEquals(view.getInt32(result + 52, true), -250);
  assertEquals(view.getInt32(result + 56, true), 100);
  assertEquals(view.getUint32(result + 60, true), 900);
  assertEquals(view.getUint32(result + 64, true), 250);
  assertEquals(view.getInt32(result + 68, true), 500);
  assertEquals(view.getInt32(result + 72, true), 700);
  assertEquals(view.getUint32(result + 76, true), 0x80);
});

Deno.test("format 4 cmap supplies the zero-glyph advance", async () => {
  const wasm = await runtime();
  const { result, status, view } = await readFixture(wasm, "format4.ttf");
  assertEquals(status, 0);
  assertAlmostEquals(view.getFloat64(result + 40, true), 0.6);
});

Deno.test("CFF-flavored sfnt and hmtx clamping keep metric behavior", async () => {
  const wasm = await runtime();
  for (const name of ["metrics-cff.otf", "clamped-glyph.ttf"]) {
    const { result, status, view } = await readFixture(wasm, name);
    assertEquals(status, 0);
    assertEquals(view.getUint32(result + 4, true), 1000);
    assertAlmostEquals(view.getFloat64(result + 40, true), 0.6);
  }
});

Deno.test("collection face selection is bounded and exact", async () => {
  const wasm = await runtime();
  const first = await readFixture(wasm, "two-face.ttc", 0);
  assertEquals(first.status, 0);
  assertEquals(first.view.getUint32(first.result + 4, true), 1000);
  const second = await readFixture(wasm, "two-face.ttc", 1);
  assertEquals(second.status, 0);
  assertEquals(second.view.getUint32(second.result + 4, true), 2048);
  assertEquals(second.view.getInt32(second.result + 8, true), 1600);
  const absent = await readFixture(wasm, "two-face.ttc", 2);
  assertEquals(absent.status, wasm.font_metrics_error_face_index.value);
  assertEquals(wasm.font_metrics_error_field(), 2);
});

Deno.test("malformed fixtures return stable codes and fields", async () => {
  const wasm = await runtime();
  const fixtures = JSON.parse(
    await Deno.readTextFile(
      new URL("fixtures/malformed.json", import.meta.url),
    ),
  );
  for (const fixture of fixtures.cases) {
    const bytes = (
      await Deno.readFile(
        new URL(`fixtures/${fixture.base}`, import.meta.url),
      )
    ).slice(0, fixture.length);
    for (const patch of fixture.patches) {
      bytes.set(
        Uint8Array.from(
          patch.hex.match(/../g),
          (part) => Number.parseInt(part, 16),
        ),
        patch.offset,
      );
    }
    const pointer = wasm.font_metrics_alloc(bytes.length);
    const result = wasm.font_metrics_alloc(80);
    new Uint8Array(wasm.memory.buffer, pointer, bytes.length).set(bytes);
    assertEquals(
      wasm.font_metrics_read(pointer, bytes.length, 0, 7, result),
      fixture.error,
      fixture.name,
    );
    if (fixture.field !== undefined) {
      assertEquals(
        wasm.font_metrics_error_field(),
        fixture.field,
        fixture.name,
      );
    }
  }
  const valid = await Deno.readFile(
    new URL("fixtures/metrics.ttf", import.meta.url),
  );
  const pointer = wasm.font_metrics_alloc(valid.length);
  const result = wasm.font_metrics_alloc(80);
  new Uint8Array(wasm.memory.buffer, pointer, valid.length).set(valid);
  assertEquals(wasm.font_metrics_read(pointer, valid.length, 0, 8, result), 5);
});
