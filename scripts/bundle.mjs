import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

/**
 * Bundles each function for Lambda: one ESM file per function under
 * dist/<name>/, targeting the Node major in .node-version (the Lambda
 * runtime follows the same number), with Powertools and everything else
 * bundled in but the AWS SDK v3, which is copied beside the file as
 * dist/<name>/node_modules, at the versions the lock file installed.
 *
 * The SDK is outside the file because the AWS Lambda Layer for OpenTelemetry
 * instruments a library by intercepting its load, and a library inside the
 * bundle is never loaded (decision 0055). It is the function's own
 * copy and not the runtime's, which AWS says to rely on only "when you can't
 * include additional packages" (Lambda developer guide, "Using the SDK for
 * JavaScript v3 in your handler", read 2026-11-17).
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

/** `@scope/name/sub/path` is the package `@scope/name`. */
const packageOf = (specifier) => specifier.split("/").slice(0, specifier.startsWith("@") ? 2 : 1).join("/");

/** The directory Node would load `name` from for a module in `fromDir`, or undefined. */
function installed(name, fromDir) {
  for (let dir = fromDir; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(join(candidate, "package.json"))) return candidate;
    if (relative(rootDir, dir) === "" || dirname(dir) === dir) return undefined;
  }
}

/**
 * Copies the packages the bundle imports, and everything they depend on,
 * into `outdir`/node_modules, each at the place under node_modules it was
 * installed at, so that Node resolves there what it resolved here. Type
 * declarations are left behind: nothing loads them.
 */
function copyPackages(imported, entryDir, outdir) {
  rmSync(join(outdir, "node_modules"), { recursive: true, force: true });
  const copied = new Map();
  const queue = imported.map((name) => ({ name, fromDir: entryDir, optional: false }));
  for (let next = queue.shift(); next; next = queue.shift()) {
    const source = installed(next.name, next.fromDir);
    if (!source) {
      if (next.optional) continue;
      throw new Error(`${next.name} is imported by the bundle and is not installed for ${next.fromDir}`);
    }
    // A workspace's own node_modules and the root's become one directory.
    const segments = relative(rootDir, source).split(sep);
    const target = segments.slice(segments.indexOf("node_modules")).join("/");
    const earlier = copied.get(target);
    if (earlier === source) continue;
    if (earlier) throw new Error(`${target} would hold both ${earlier} and ${source}`);
    copied.set(target, source);

    cpSync(source, join(outdir, target), {
      recursive: true,
      dereference: true,
      filter: (path) => !["node_modules", "dist-types"].includes(basename(path)) || path === source,
    });
    const pkg = JSON.parse(readFileSync(join(source, "package.json"), "utf8"));
    for (const name of Object.keys(pkg.dependencies ?? {})) queue.push({ name, fromDir: source, optional: false });
    for (const name of Object.keys({ ...pkg.optionalDependencies, ...pkg.peerDependencies })) {
      queue.push({ name, fromDir: source, optional: true });
    }
  }
  return copied.size;
}

for (const name of names) {
  const fn = manifest.functions[name];
  if (!fn) {
    console.error(`unknown function "${name}"; known: ${Object.keys(manifest.functions).join(", ")}`);
    process.exit(1);
  }
  const outdir = new URL(`dist/${name}/`, root);
  mkdirSync(outdir, { recursive: true });
  const entry = fileURLToPath(new URL(fn.entry, root));

  const result = await build({
    entryPoints: [entry],
    outfile: fileURLToPath(new URL("index.mjs", outdir)),
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

  const imported = new Set(
    Object.values(result.metafile.outputs)
      .flatMap((output) => output.imports)
      .filter((imported) => imported.external && EXTERNAL_SCOPES.some((scope) => imported.path.startsWith(`${scope}/`)))
      .map((imported) => packageOf(imported.path)),
  );
  const count = copyPackages([...imported].sort(), dirname(entry), fileURLToPath(outdir));
  console.log(`bundled ${name} -> dist/${name}/index.mjs, with ${String(count)} packages in dist/${name}/node_modules`);
}
