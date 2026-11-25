// What scripts/check-loaded-documents.mjs counts as loaded and when it
// refuses, on documents written here; and that the loaders it names exist,
// read from the tree. Run by `npm test` (test:scripts).
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";

import { checkLimits, LIMITS, loadedDocuments, renderLimits } from "./check-loaded-documents.mjs";

const tree = {
  "AGENTS.md": [
    "# Entry",
    "",
    "- How we work: @docs/process/a.md",
    "- The shells: @docs/process/b.md",
    "- A person's own notes: @~/notes.md and @/etc/notes.md",
    "",
    "Write to docs@heat.md, or read `@docs/process/span.md`.",
    "",
    "```text",
    "@docs/process/fenced.md",
    "```",
    "",
  ].join("\n"),
  // An import is read from the directory of the document that holds it.
  "docs/process/a.md": `${"a".repeat(100)} and @c.md\n`,
  "docs/process/b.md": "é".repeat(50),
  "docs/process/c.md": "back to @../../AGENTS.md",
};
/** Refuses a path that is not in the tree, as a file system does, so that following a wrong import fails a test. */
const read = (from) => (path) => {
  if (!(path in from)) throw new Error(`no such file: ${path}`);
  return from[path];
};

test("a loader's documents are its imports and theirs, each once, read from the importing document's directory", () => {
  const documents = loadedDocuments("AGENTS.md", read(tree));
  assert.deepEqual(
    documents.map((document) => document.path),
    ["AGENTS.md", "docs/process/a.md", "docs/process/c.md", "docs/process/b.md"],
  );
});

test("an address, a code span, a fenced block and a path outside the repository are not imports", () => {
  // Each of the five would be a path the tree does not hold, and `read` would throw.
  assert.equal(loadedDocuments("AGENTS.md", read(tree)).length, 4);
});

test("an import that cannot be read is refused with the document that holds it", () => {
  const broken = { ...tree, "docs/process/b.md": "see @gone.md" };
  assert.throws(() => loadedDocuments("AGENTS.md", read(broken)), /docs\/process\/b\.md imports docs\/process\/gone\.md, which cannot be read/);
});

test("imports are followed four deep, as Claude Code follows them", () => {
  const chain = { "AGENTS.md": "@1.md", "1.md": "@2.md", "2.md": "@3.md", "3.md": "@4.md", "4.md": "@5.md" };
  assert.deepEqual(
    loadedDocuments("AGENTS.md", read(chain)).map((document) => document.path),
    ["AGENTS.md", "1.md", "2.md", "3.md", "4.md"],
  );
});

test("a document is counted in bytes, not characters", () => {
  const b = loadedDocuments("AGENTS.md", read(tree)).find((document) => document.path === "docs/process/b.md");
  assert.equal(b.bytes, 100);
});

test("a loader at its limit passes, and one byte over is refused", () => {
  const total = Object.values(tree).reduce((sum, text) => sum + Buffer.byteLength(text), 0);
  const [at] = checkLimits({ "AGENTS.md": total }, read(tree));
  assert.equal(at.total, total);
  assert.equal(at.over, false);
  const [over] = checkLimits({ "AGENTS.md": total - 1 }, read(tree));
  assert.equal(over.over, true);
  assert.match(renderLimits([over]), /over by 1: /);
  assert.doesNotMatch(renderLimits([at]), /over by/);
});

test("every loader the script names is a file of the tree", () => {
  for (const loader of Object.keys(LIMITS)) assert.ok(existsSync(new URL(`../${loader}`, import.meta.url)), loader);
});
