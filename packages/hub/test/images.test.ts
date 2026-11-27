import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { imageFrom } from "./setup/image.js";

/**
 * An image a test starts is pinned by version and digest, and Dependabot can
 * see it (docs/standards/typescript.md, rule 33).
 */
const root = fileURLToPath(new URL("../../../", import.meta.url));
const packages = join(root, "packages");
const self = fileURLToPath(import.meta.url);
const skipped = new Set(["node_modules", "dist", ".angular", "generated"]);

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (skipped.has(entry.name)) return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const files = walk(packages);
const sources = files.filter((file) => /\.(?:m?ts|m?js)$/.test(file) && file !== self);
const dockerfiles = files.filter((file) => /dockerfile|containerfile/i.test(file.split(sep).at(-1) ?? ""));
const posix = (file: string) => relative(root, file).split(sep).join("/");

describe("the images a test starts", () => {
  it("are each taken from a pinned Dockerfile by imageFrom", () => {
    const calls = sources.flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/GenericContainer\(([^)]*)/g)].map((match) => ({
        file: posix(file),
        argument: (match[1] ?? "").trim(),
      })),
    );
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.filter((call) => !call.argument.startsWith("imageFrom("))).toEqual([]);
  });

  it("name an exact version and digest in each Dockerfile", () => {
    expect(dockerfiles.length).toBeGreaterThan(0);
    for (const file of dockerfiles) expect(() => imageFrom(pathToFileURL(file))).not.toThrow();
  });

  it("are in directories Dependabot's docker ecosystem watches", () => {
    const config = readFileSync(join(root, ".github", "dependabot.yml"), "utf8");
    const docker = /- package-ecosystem: docker\n([\s\S]*?)(?=\n {2}- package-ecosystem:|$)/.exec(config)?.[1] ?? "";
    const watched = [...docker.matchAll(/^\s+- (\/\S*)$/gm)].map((match) => match[1]);
    const directories = dockerfiles.map((file) => `/${posix(file).split("/").slice(0, -1).join("/")}`);
    expect(directories.filter((directory) => !watched.includes(directory))).toEqual([]);
  });
});

describe("imageFrom", () => {
  const scratch = mkdtempSync(join(tmpdir(), "heat-image-"));
  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });
  const digest = "0".repeat(64);
  const fileWith = (text: string) => {
    const file = join(scratch, `${String(Math.random()).slice(2)}.Dockerfile`);
    writeFileSync(file, text);
    return pathToFileURL(file);
  };

  it("returns a reference pinned by version and digest", () => {
    expect(imageFrom(fileWith(`# a comment\nFROM amazon/dynamodb-local:3.3.2@sha256:${digest}\n`))).toBe(
      `amazon/dynamodb-local:3.3.2@sha256:${digest}`,
    );
  });

  it.each([
    ["latest", "FROM amazon/dynamodb-local:latest"],
    ["a bare tag", "FROM amazon/dynamodb-local:3.3.2"],
    ["latest with a digest", `FROM amazon/dynamodb-local:latest@sha256:${digest}`],
    ["a digest with no version", `FROM amazon/dynamodb-local@sha256:${digest}`],
    ["a short digest", "FROM amazon/dynamodb-local:3.3.2@sha256:abc"],
    ["no FROM line", "# nothing"],
    ["two FROM lines", `FROM a:1@sha256:${digest}\nFROM b:2@sha256:${digest}`],
  ])("refuses %s", (_case, text) => {
    expect(() => imageFrom(fileWith(text))).toThrow();
  });
});
