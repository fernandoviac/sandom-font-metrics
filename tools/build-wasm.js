import { assembleWat } from "./wat-assembler/assemble.js";

const root = new URL("../", import.meta.url);
const sourceDirectory = new URL("src/", root);
const distDirectory = new URL("dist/", root);
const manifestUrl = new URL("font-metrics.manifest.json", sourceDirectory);
const check = Deno.args.length === 1 && Deno.args[0] === "--check";
if ((!check && Deno.args.length !== 0) || Deno.args.length > 1) {
  throw new Error(
    "Usage: deno run --allow-read --allow-write tools/build-wasm.js [--check]",
  );
}

const encoder = new TextEncoder();
const hex = (bytes) =>
  [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
const digest = async (value) =>
  hex(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        typeof value === "string" ? encoder.encode(value) : value,
      ),
    ),
  );

// The build record names the encoder that produced the binary. The vendored
// assembler carries its own identity, so the record follows a version bump
// instead of restating one.
const assemblerVersion = JSON.parse(
  await Deno.readTextFile(
    new URL("wat-assembler/identity.json", import.meta.url),
  ),
).dependencies.find(({ name }) => name === "wat").version;

const manifestText = await Deno.readTextFile(manifestUrl);
const manifest = JSON.parse(manifestText);
if (
  manifest?.kind !== "sandom/webassembly-source-manifest" ||
  manifest.version !== 1 || manifest.module !== "font-metrics" ||
  JSON.stringify(manifest.embeddable?.requires) !==
    JSON.stringify(["memory"]) ||
  manifest.embeddable?.scratchBytes !== 0 ||
  !Array.isArray(manifest.components) || manifest.components.length !== 4
) throw new Error("Invalid font-metrics WebAssembly source manifest");
const seen = new Set();
const componentRecords = [];
const componentTexts = [];
for (const path of manifest.components) {
  if (
    typeof path !== "string" || !path.endsWith(".watpart") || seen.has(path)
  ) {
    throw new Error(`Invalid component path: ${path}`);
  }
  seen.add(path);
  const text = await Deno.readTextFile(new URL(path, sourceDirectory));
  componentRecords.push({ path, digest: await digest(text) });
  componentTexts.push(`  ;; component: ${path}\n${text.trimEnd()}\n`);
}
for (const path of manifest.embeddable.components) {
  if (!seen.has(path)) throw new Error(`Unknown embeddable component: ${path}`);
}
const aggregate = `(module\n${componentTexts.join("")}\n)\n`;
const sourceDigest = await digest(JSON.stringify({
  manifest: await digest(manifestText),
  components: componentRecords,
}));
const aggregateDigest = await digest(aggregate);
// The wat crate encodes without validating, so the binding compiles every
// result with WebAssembly.compile. That is the validation the separate
// wasm-validate spawn used to perform, done by the engine that will run the
// module, so no second validator is needed.
const wasm = await assembleWat(aggregate, "font-metrics.wat");
const binaryDigest = await digest(wasm);
const record = JSON.stringify(
  {
    kind: "sandom/webassembly-build",
    version: 1,
    module: "font-metrics",
    compiler: `wat-assembler (wat ${assemblerVersion})`,
    validator: "WebAssembly.compile",
    sourceDigest,
    aggregateDigest,
    binaryDigest,
    components: componentRecords,
  },
  null,
  2,
) + "\n";
const outputs = [
  [new URL("font-metrics.wat", distDirectory), encoder.encode(aggregate)],
  [new URL("font-metrics.wasm", distDirectory), wasm],
  [new URL("font-metrics.build.json", distDirectory), encoder.encode(record)],
];
if (check) {
  for (const [url, expected] of outputs) {
    let actual;
    try {
      actual = await Deno.readFile(url);
    } catch {
      throw new Error(`Missing build artifact ${url.pathname}`);
    }
    if (
      actual.length !== expected.length ||
      !actual.every((value, index) => value === expected[index])
    ) {
      throw new Error(`Stale build artifact ${url.pathname}`);
    }
  }
} else {
  await Deno.mkdir(distDirectory, { recursive: true });
  for (const [url, bytes] of outputs) await Deno.writeFile(url, bytes);
}
console.log(JSON.stringify({ sourceDigest, aggregateDigest, binaryDigest }));
