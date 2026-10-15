import { build } from "esbuild";
import { mkdirSync, readFileSync } from "node:fs";

/**
 * Bundles a function for Lambda: one ESM file per function, Node 22 target,
 * the AWS SDK v3 bundled in (it tree-shakes well and pinning beats relying
 * on the runtime's copy). The workflow uploads the result and calls
 * update-function-code; Terraform owns the function (decision 0011).
 *
 * Usage: node scripts/bundle.mjs <function-name>   (names from local/manifest.json)
 */
const name = process.argv[2];
const manifest = JSON.parse(readFileSync(new URL("../local/manifest.json", import.meta.url), "utf8"));
const fn = manifest.functions[name];
if (!fn) {
  console.error(`unknown function "${name}"; known: ${Object.keys(manifest.functions).join(", ")}`);
  process.exit(1);
}

const outdir = new URL(`../dist/${name}/`, import.meta.url);
mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: [new URL(`../${fn.entry}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")],
  outfile: new URL("index.mjs", outdir).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  minify: false,
  banner: {
    // CommonJS dependencies inside an ESM bundle need these globals.
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
console.log(`bundled ${name} -> dist/${name}/index.mjs`);
