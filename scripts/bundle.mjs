import { build } from "esbuild";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Bundles each function for Lambda: one ESM file per function under
 * dist/<name>/, targeting the Node major in .node-version (the Lambda
 * runtime follows the same number), the AWS SDK v3 and Powertools bundled in
 * (they tree-shake well and pinning beats relying on the runtime's copy).
 * Terraform zips dist/<name>/ and passes the zip to the function with its
 * hash, so a change of code is a change in the plan (decision 0017). esbuild
 * is deterministic for the same inputs and lock file, which is what keeps a
 * laptop's plan and the pipeline's plan showing the same hash.
 *
 * Usage: node scripts/bundle.mjs [function-name]   (names from manifest.json; all when omitted)
 */
const root = new URL("../", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"));
const names = process.argv[2] ? [process.argv[2]] : Object.keys(manifest.functions);
const nodeMajor = readFileSync(new URL(".node-version", root), "utf8").trim().split(".")[0];

for (const name of names) {
  const fn = manifest.functions[name];
  if (!fn) {
    console.error(`unknown function "${name}"; known: ${Object.keys(manifest.functions).join(", ")}`);
    process.exit(1);
  }
  const outdir = new URL(`dist/${name}/`, root);
  mkdirSync(outdir, { recursive: true });

  await build({
    entryPoints: [fileURLToPath(new URL(fn.entry, root))],
    outfile: fileURLToPath(new URL("index.mjs", outdir)),
    bundle: true,
    platform: "node",
    target: `node${nodeMajor}`,
    format: "esm",
    sourcemap: true,
    minify: false,
    banner: {
      // CommonJS dependencies inside an ESM bundle need these globals.
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
  });
  console.log(`bundled ${name} -> dist/${name}/index.mjs`);
}
