const expected = new Set([
  "package.json",
  "README.md",
  "DESIGN.md",
  "LICENSE",
  "NOTICE",
  "dist/font-metrics.wasm",
  "dist/font-metrics.wat",
  "dist/font-metrics.build.json",
  "src/font-metrics.manifest.json",
  "src/font-metrics-module.watpart",
  "src/font-metrics-runtime.watpart",
  "src/font-metrics-abi.watpart",
  "src/font-metrics-reader.watpart",
  "docs/abi.md",
  "docs/composition.md",
  "docs/legal/wat-assembler.md",
]);
const result = await new Deno.Command("npm", {
  args: ["pack", "--dry-run", "--json", "--ignore-scripts"],
  stdout: "piped",
  stderr: "piped",
}).output();
if (!result.success) throw new Error(new TextDecoder().decode(result.stderr));
const report = JSON.parse(new TextDecoder().decode(result.stdout));
const files = new Set(report[0]?.files?.map(({ path }) => path));
for (const path of expected) {
  if (!files.has(path)) throw new Error(`Package is missing ${path}`);
}
for (const path of files) {
  if (!expected.has(path)) {
    throw new Error(`Package contains unexpected ${path}`);
  }
  if (/\.(?:js|mjs|cjs|ts|tsx|jsx|d\.ts|c|cc|cpp|h|hpp|rs)$/.test(path)) {
    throw new Error(`Package contains prohibited runtime source ${path}`);
  }
}
const packageJson = JSON.parse(
  await Deno.readTextFile(new URL("../package.json", import.meta.url)),
);
if (
  packageJson.exports?.["./font-metrics.wasm"] !== "./dist/font-metrics.wasm"
) {
  throw new Error("Package binary export is missing");
}
const wasm = await Deno.readFile(
  new URL("../dist/font-metrics.wasm", import.meta.url),
);
const imports = WebAssembly.Module.imports(new WebAssembly.Module(wasm));
if (imports.length !== 0) {
  throw new Error(`Unexpected import surface: ${JSON.stringify(imports)}`);
}
console.log(
  JSON.stringify({
    kind: "sandom/font-metrics-package-check",
    files: files.size,
    imports,
  }),
);
