import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { nodeFileTrace } from "@vercel/nft";
import { build } from "esbuild";

/**
 * Bundles each function for Lambda: one ESM file per function under
 * dist/<name>/, targeting the Node major in .node-version (the Lambda
 * runtime follows the same number), with Powertools and everything else
 * bundled in but the AWS SDK v3, whose files are copied beside it as
 * dist/<name>/node_modules, at the versions the lock file installed.
 *
 * The SDK is outside the file because the AWS Lambda Layer for OpenTelemetry
 * instruments a library by intercepting its load, and a library inside the
 * bundle is never loaded (decision 0055). It is the function's own
 * copy and not the runtime's, which AWS says to rely on only "when you can't
 * include additional packages" (Lambda developer guide, "Using the SDK for
 * JavaScript v3 in your handler", read 2026-11-17).
 *
 * Which files that is, is @vercel/nft's to say (docs/standards/typescript.md,
 * rule 17): it traces what the bundle's imports load at run time, so a
 * package's type declarations, its build for bundlers and the clients nothing
 * calls stay behind.
 *
 * Terraform zips dist/<name>/ and passes the zip to the function with its
 * hash, so a change of code is a change in the plan (decision 0017). esbuild
 * is deterministic for the same inputs and lock file, which is what keeps a
 * laptop's plan and the pipeline's plan showing the same hash.
 *
 * Usage: node scripts/bundle.mjs [function-name]   (names from manifest.json; all when omitted)
 */
const root = new URL("../", import.meta.url);
const rootDir = fileURLToPath(root);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"));
const names = process.argv[2] ? [process.argv[2]] : Object.keys(manifest.functions);
const nodeMajor = readFileSync(new URL(".node-version", root), "utf8").trim().split(".")[0];

/** What stays out of the file: the AWS SDK v3's two scopes. */
const EXTERNAL_SCOPES = ["@aws-sdk", "@smithy"];
const isExternal = (specifier) => EXTERNAL_SCOPES.some((scope) => specifier.startsWith(`${scope}/`));

/**
 * The file each of the bundle's SDK imports loads, resolved as the function
 * will resolve it: from the one file, so from the entry's place in the tree.
 * Bundling moves every import into that file, so a bundled package that would
 * have loaded a copy of its own, nested under it at another version, would be
 * given the function's instead and nothing would say so. That is refused here.
 */
function sdkEntries(metafile, entry) {
  const fromEntry = createRequire(entry);
  const entries = new Set();
  for (const [input, { imports }] of Object.entries(metafile.inputs)) {
    const fromInput = createRequire(resolve(rootDir, input));
    for (const { path: specifier, external } of imports) {
      if (!external || !isExternal(specifier)) continue;
      const loaded = fromEntry.resolve(specifier);
      const wanted = fromInput.resolve(specifier);
      if (wanted !== loaded) {
        throw new Error(`${input} imports ${specifier} from ${wanted}, and the bundle would load ${loaded}`);
      }
      entries.add(loaded);
    }
  }
  return [...entries].sort();
}

/**
 * Copies the files those entries load into `outdir`/node_modules, each at the
 * place under node_modules it was installed at, so that Node resolves there
 * what it resolved here. A workspace's own node_modules and the root's become
 * one directory, and two files that would land on one path are an error.
 */
async function copySdk(entries, outdir) {
  rmSync(join(outdir, "node_modules"), { recursive: true, force: true });
  const { fileList } = await nodeFileTrace(entries, { base: rootDir, processCwd: rootDir });
  const copied = new Map();
  for (const file of [...fileList].sort()) {
    const segments = file.split(/[\\/]/);
    const at = segments.indexOf("node_modules");
    if (at === -1) throw new Error(`${file} is loaded by the SDK and is not under node_modules`);
    const target = segments.slice(at).join("/");
    const earlier = copied.get(target);
    if (earlier) throw new Error(`${target} would hold both ${earlier} and ${file}`);
    copied.set(target, file);
    const destination = join(outdir, target);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(rootDir, file), destination, { dereference: true });
  }
  return copied.size;
}

for (const name of names) {
  const fn = manifest.functions[name];
  if (!fn) {
    console.error(`unknown function "${name}"; known: ${Object.keys(manifest.functions).join(", ")}`);
    process.exit(1);
  }
  const outdir = fileURLToPath(new URL(`dist/${name}/`, root));
  mkdirSync(outdir, { recursive: true });
  const entry = fileURLToPath(new URL(fn.entry, root));

  const { metafile } = await build({
    entryPoints: [entry],
    outfile: join(outdir, "index.mjs"),
    bundle: true,
    platform: "node",
    target: `node${nodeMajor}`,
    format: "esm",
    sourcemap: true,
    minify: false,
    external: EXTERNAL_SCOPES.map((scope) => `${scope}/*`),
    metafile: true,
    banner: {
      // CommonJS dependencies inside an ESM bundle need these globals.
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
  });

  const count = await copySdk(sdkEntries(metafile, entry), outdir);
  console.log(`bundled ${name} -> dist/${name}/index.mjs, with ${String(count)} files of the AWS SDK in ${relative(rootDir, outdir).split(sep).join("/")}/node_modules`);
}
