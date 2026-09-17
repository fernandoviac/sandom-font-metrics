const root = new URL("../", import.meta.url);
const wasm = await Deno.readFile(new URL("dist/font-metrics.wasm", root));
const deno = await WebAssembly.instantiate(wasm, {});
if (deno.instance.exports.font_metrics_abi_version() !== 1) {
  throw new Error("Deno direct instantiation failed");
}
let binary = "";
for (let offset = 0; offset < wasm.length; offset += 0x8000) {
  binary += String.fromCharCode(...wasm.subarray(offset, offset + 0x8000));
}
const html = `<!doctype html><body>RUNNING<script type="module">
try {
  const raw = atob(${JSON.stringify(btoa(binary))});
  const bytes = Uint8Array.from(raw, value => value.charCodeAt(0));
  const { instance } = await WebAssembly.instantiate(bytes, {});
  document.body.textContent = instance.exports.font_metrics_abi_version() === 1
    ? "FONT_METRICS_BROWSER_PASS" : "FONT_METRICS_BROWSER_FAIL";
} catch (error) { document.body.textContent = "FONT_METRICS_BROWSER_FAIL " + error; }
</script>`;
const directory = await Deno.makeTempDir({ prefix: "font-metrics-browser-" });
try {
  const page = `${directory}/index.html`;
  await Deno.writeTextFile(page, html);
  const candidates = [
    Deno.env.get("BROWSER_BIN"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean);
  let browser;
  for (const candidate of candidates) {
    try {
      if ((await Deno.stat(candidate)).isFile) {
        browser = candidate;
        break;
      }
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
  }
  if (!browser) throw new Error("No Chrome/Chromium binary; set BROWSER_BIN");
  const run = await new Deno.Command(browser, {
    args: [
      "--headless",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--allow-file-access-from-files",
      "--virtual-time-budget=5000",
      "--dump-dom",
      `file://${page}`,
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();
  const output = new TextDecoder().decode(run.stdout);
  if (!run.success || !output.includes("FONT_METRICS_BROWSER_PASS")) {
    throw new Error(`Browser direct instantiation failed:\n${output}`);
  }
  console.log(
    JSON.stringify({ deno: "pass", browser: "pass", executable: browser }),
  );
} finally {
  await Deno.remove(directory, { recursive: true });
}
