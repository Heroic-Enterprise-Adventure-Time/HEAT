import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * The size of what a session loads before its first word (docs/README.md,
 * rule 3; decision 0060). An `AGENTS.md` and every document it imports with
 * `@path` are in the context of every call of every session that starts
 * there, so their size is paid for at each call, and it doubled in a month
 * while only a guideline in lines held it (Issue-363).
 *
 * Each loader named here is held to a size in bytes for itself and what it
 * imports, followed through the imports' own imports. A pull request that
 * takes one past its size makes room, by moving out of a loaded document
 * what a session does not need at its start, or raises the number here and
 * says why in its description. Bytes and not tokens, because a byte is what
 * a job can count with nothing installed; on these documents a token is
 * about 2.7 bytes.
 *
 *   node scripts/check-loaded-documents.mjs
 */

/** Each loader, and the most bytes it and its imports may hold together. */
export const LIMITS = {
  // The root: the four process documents every session reads (Issue-363 cut them from 54,624).
  "AGENTS.md": 45_000,
};

/** An import is `@` and a path to a Markdown file, standing where a word starts. */
const IMPORT = /(?<![\w`@/.-])@([\w./-]+\.md)\b/g;

/**
 * The loader and every document it imports, each once, in the order met.
 * `read` returns a file's text by its path from the repository's root.
 */
export function loadedDocuments(loader, read) {
  const documents = [];
  const seen = new Set();
  const visit = (path) => {
    if (seen.has(path)) return;
    seen.add(path);
    const text = read(path);
    documents.push({ bytes: Buffer.byteLength(text, "utf8"), path });
    for (const [, imported] of text.matchAll(IMPORT)) visit(imported);
  };
  visit(loader);
  return documents;
}

/** Each loader's documents and total against its limit. */
export function checkLimits(limits, read) {
  return Object.entries(limits).map(([loader, limit]) => {
    const documents = loadedDocuments(loader, read);
    const total = documents.reduce((sum, document) => sum + document.bytes, 0);
    return { documents, limit, loader, over: total > limit, total };
  });
}

const number = (value) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** The result as text: every document's size, then the total beside its limit. */
export function renderLimits(results) {
  const lines = [];
  for (const result of results) {
    lines.push(`${result.loader} loads ${number(result.total)} bytes, and its limit is ${number(result.limit)}`);
    for (const document of result.documents) lines.push(`  ${number(document.bytes).padStart(7)}  ${document.path}`);
    if (result.over) {
      lines.push(`  over by ${number(result.total - result.limit)}: move out of a loaded document what a session does not need at its start,`);
      lines.push("  or raise the limit in scripts/check-loaded-documents.mjs and say why in the pull request (docs/README.md, rule 3)");
    }
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  // Line endings are counted as git stores them, so a checkout on Windows measures what CI measures.
  const results = checkLimits(LIMITS, (path) => readFileSync(path, "utf8").replaceAll("\r\n", "\n"));
  process.stdout.write(renderLimits(results));
  if (results.some((result) => result.over)) process.exitCode = 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
