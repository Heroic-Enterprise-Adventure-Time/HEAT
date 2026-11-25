// What scripts/check-loaded-documents.mjs counts as loaded and when it
// refuses, on documents written here; and that the loaders it names exist,
// read from the tree. Run by `npm test` (test:scripts).
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";

import { checkLimits, LIMITS, loadedDocuments, renderLimits } from "./check-loaded-documents.mjs";

const tree = {
  "AGENTS.md": "# Entry\n\n- How we work: @docs/process/a.md\n- The shells: @docs/process/b.md\n\nWrite to someone@example.com, or read `@docs/process/quoted.md`.\n",
  "docs/process/a.md": "a".repeat(100) + " and @docs/process/c.md\n",
  "docs/process/b.md": "é".repeat(50),
  "docs/process/c.md": "back to @AGENTS.md",
};
const read = (path) => {
  if (!(path in tree)) throw new Error(`read a file that is not loaded: ${path}`);
  return tree[path];
};

test("a loader's documents are its imports and theirs, each once", () => {
  const documents = loadedDocuments("AGENTS.md", read);
  assert.deepEqual(
    documents.map((document) => document.path),
    ["AGENTS.md", "docs/process/a.md", "docs/process/c.md", "docs/process/b.md"],
  );
});

test("an address and a path in backticks are not imports", () => {
  const paths = loadedDocuments("AGENTS.md", read).map((document) => document.path);
  assert.ok(!paths.includes("example.com"));
  assert.ok(!paths.includes("docs/process/quoted.md"));
});

test("a document is counted in bytes, not characters", () => {
  const b = loadedDocuments("AGENTS.md", read).find((document) => document.path === "docs/process/b.md");
  assert.equal(b.bytes, 100);
});

test("a loader at its limit passes, and one byte over is refused", () => {
  const total = Object.values(tree).reduce((sum, text) => sum + Buffer.byteLength(text), 0);
  const [at] = checkLimits({ "AGENTS.md": total }, read);
  assert.equal(at.total, total);
  assert.equal(at.over, false);
  const [over] = checkLimits({ "AGENTS.md": total - 1 }, read);
  assert.equal(over.over, true);
  assert.match(renderLimits([over]), /over by 1: /);
  assert.doesNotMatch(renderLimits([at]), /over by/);
});

test("every loader the script names is a file of the tree", () => {
  for (const loader of Object.keys(LIMITS)) assert.ok(existsSync(new URL(`../${loader}`, import.meta.url)), loader);
});
