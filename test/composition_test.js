import { assembleWat } from "../tools/wat-assembler/assemble.js";
import { assertEquals } from "@std/assert";

Deno.test("installed archive composes the embeddable reader", async () => {
  const root = new URL("../", import.meta.url);
  const temp = await Deno.makeTempDir({ prefix: "font-metrics-compose-" });
  try {
    const packed = await new Deno.Command("npm", {
      args: ["pack", "--json", "--ignore-scripts", root.pathname],
      cwd: temp,
      stdout: "piped",
      stderr: "piped",
    }).output();
    assertEquals(packed.success, true, new TextDecoder().decode(packed.stderr));
    const [{ filename }] = JSON.parse(new TextDecoder().decode(packed.stdout));
    await Deno.writeTextFile(`${temp}/package.json`, '{"private":true}');
    const installed = await new Deno.Command("npm", {
      args: ["install", "--ignore-scripts", `./${filename}`],
      cwd: temp,
      stdout: "null",
      stderr: "piped",
    }).output();
    assertEquals(
      installed.success,
      true,
      new TextDecoder().decode(installed.stderr),
    );
    const packageRoot = `${temp}/node_modules/@sandom/font-metrics/`;
    const manifest = JSON.parse(
      await Deno.readTextFile(`${packageRoot}src/font-metrics.manifest.json`),
    );
    const parts = await Promise.all(
      manifest.embeddable.components.map((path) =>
        Deno.readTextFile(`${packageRoot}src/${path}`)
      ),
    );
    const wat = `(module\n(memory (export "memory") 2)\n${parts.join("\n")}\n)`;
    const { instance } = await WebAssembly.instantiate(
      await assembleWat(wat, "consumer composition"),
      {},
    );
    const font = await Deno.readFile(
      new URL("fixtures/metrics.ttf", import.meta.url),
    );
    new Uint8Array(instance.exports.memory.buffer, 1024, font.length).set(font);
    assertEquals(
      instance.exports.font_metrics_read(1024, font.length, 0, 7, 2048),
      0,
    );
    const composed = new Uint8Array(
      instance.exports.memory.buffer,
      2048,
      80,
    ).slice();
    const standalone = (
      await WebAssembly.instantiate(
        await Deno.readFile(
          new URL("../dist/font-metrics.wasm", import.meta.url),
        ),
        {},
      )
    ).instance.exports;
    const standaloneFont = standalone.font_metrics_alloc(font.length);
    const standaloneResult = standalone.font_metrics_alloc(80);
    new Uint8Array(
      standalone.memory.buffer,
      standaloneFont,
      font.length,
    ).set(font);
    assertEquals(
      standalone.font_metrics_read(
        standaloneFont,
        font.length,
        0,
        7,
        standaloneResult,
      ),
      0,
    );
    assertEquals(
      composed,
      new Uint8Array(
        standalone.memory.buffer,
        standaloneResult,
        80,
      ).slice(),
    );
    const malformed = JSON.parse(
      await Deno.readTextFile(
        new URL("fixtures/malformed.json", import.meta.url),
      ),
    );
    for (const fixture of malformed.cases) {
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
      new Uint8Array(instance.exports.memory.buffer, 4096, bytes.length).set(
        bytes,
      );
      assertEquals(
        instance.exports.font_metrics_read(
          4096,
          bytes.length,
          0,
          7,
          8192,
        ),
        fixture.error,
        fixture.name,
      );
      if (fixture.field !== undefined) {
        assertEquals(
          instance.exports.font_metrics_error_field(),
          fixture.field,
          fixture.name,
        );
      }
    }
  } finally {
    await Deno.remove(temp, { recursive: true });
  }
});
