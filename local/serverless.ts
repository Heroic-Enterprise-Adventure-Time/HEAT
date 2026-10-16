import { readFileSync } from "node:fs";
import path from "node:path";
import type { AWS } from "@serverless/typescript";
import { environment } from "./environment.js";

/**
 * The local emulator's configuration, and nothing else. This file is never
 * deployed: Terraform owns the real functions and gateway (decision 0011), and
 * the agent's shell denies `serverless deploy`. serverless-offline reads it to
 * run the same handlers behind an emulated HTTP API on the laptop (decisions
 * 0009 and 0017). Functions and routes are built from manifest.json at the
 * repository root, so this file, the bundler and Terraform cannot disagree
 * (docs/standards/typescript.md, rule 4). No route is written here.
 *
 * TypeScript rather than JavaScript because the framework loads a .ts file
 * through tsx, which works on Windows, while its .js loader imports a bare
 * drive path and fails there (checked against 4.44.0, decision 0017).
 */
interface Manifest {
  functions: Record<
    string,
    {
      entry: string;
      export: string;
      memoryMb: number;
      timeoutSeconds: number;
      http: { method: string; path: string; authorizer: string }[];
    }
  >;
}

const here = import.meta.dirname;
const root = path.resolve(here, "..");
const manifest = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8")) as Manifest;
const nodeMajor = readFileSync(path.join(root, ".node-version"), "utf8").trim().split(".")[0];

/**
 * The real heat-dev pool's issuer URL and browser app client id, from the
 * shell (local/README.md). Read here rather than through ${env:} so that a
 * missing value fails with its name instead of an unresolved variable.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set; see local/README.md`);
  return value;
}

/** Serverless names a handler <module path without extension>.<export>, relative to this directory. */
function handlerOf(fn: Manifest["functions"][string]): string {
  const module = path.join(root, fn.entry).replace(/\.[cm]?[jt]s$/, "");
  return `${path.relative(here, module).split(path.sep).join("/")}.${fn.export}`;
}

const functions: AWS["functions"] = Object.fromEntries(
  Object.entries(manifest.functions).map(([name, fn]) => [
    name,
    {
      handler: handlerOf(fn),
      memorySize: fn.memoryMb,
      timeout: fn.timeoutSeconds,
      events: fn.http.map((route) => ({
        httpApi: { method: route.method, path: route.path, authorizer: { name: route.authorizer } },
      })),
    },
  ]),
);

const configuration: AWS = {
  service: "heat-local",
  // Exact: the `serverless` npm package is a launcher, and this is the one
  // place the framework's own release is pinned (standards rule 2).
  frameworkVersion: "4.44.0",
  plugins: ["serverless-offline"],
  // The framework's own esbuild build is off: serverless-offline loads the
  // TypeScript handler straight from its source through tsx, so there is one
  // bundler configuration in the repository, scripts/bundle.mjs, not two. The
  // framework's build also emitted an ES module bundle without the require
  // shim that bundle.mjs adds, and the hub's dependencies failed on load.
  build: { esbuild: false },
  provider: {
    name: "aws",
    // The Lambda runtime follows the major in .node-version (standards rule 1).
    // Asserted because the types list the runtimes as literals and the major
    // is read from a file; the framework rejects an unknown runtime on load.
    runtime: `nodejs${nodeMajor}.x` as NonNullable<AWS["provider"]["runtime"]>,
    region: "us-east-1",
    environment: { ...environment },
    httpApi: {
      authorizers: {
        cognito: {
          type: "jwt",
          identitySource: "$request.header.Authorization",
          issuerUrl: required("HEAT_COGNITO_ISSUER"),
          audience: [required("HEAT_COGNITO_CLIENT_ID")],
        },
      },
    },
  },
  functions,
  custom: {
    "serverless-offline": {
      httpPort: 3000,
      lambdaPort: 3002,
      reloadHandler: true,
      // Without this the plugin skips the JWT authorizer altogether and the
      // routes are open. With it the plugin checks that a token is present,
      // unexpired, from the issuer above and for the audience above. It never
      // verifies the signature; the real gateway does (decision 0017).
      ignoreJWTSignature: true,
    },
  },
};

export default configuration;
