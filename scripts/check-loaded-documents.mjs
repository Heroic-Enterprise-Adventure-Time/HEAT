import { readFileSync } from "node:fs";
import { posix } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * The size of what a session loads before its first word (docs/README.md,
 * rule 3; decision 0060). An `AGENTS.md` and every document it imports with
 * `@path` are in the context of every call of every session that starts
 * there, so their size is paid for at each call, and it doubled in a month
 * while only a guideline in lines held it (Issue-363).
 *
 * Each loader named here is held to a size in bytes for itself and what it
 * imports. An import is followed as Claude Code follows one (its
 * documentation, "Import additional files"): a relative path is read from
 * the directory of the document that holds it, an import in a code span or
 * a fenced block is not one, and imports are followed four deep. A path
 * outside the repository, absolute or under `~`, is a person's own file and
 * is not counted.
 *
 * A pull request that takes a loader past its size makes room, by moving out
 * of a loaded document what a session does not need at its start, or raises
 * the number here and says why in its description. Bytes and not tokens,
 * because a byte is what a job can count with nothing installed; Issue-363
 * measured the four process documents at 50K bytes and 18.6k tokens.
 *
 *   node scripts/check-loaded-documents.mjs
 */

/** Each loader, and the most bytes it and its imports may hold together. */
export const LIMITS = {
  // The root, with the four process documents every session reads (decision 0060).
  "AGENTS.md": 45_000,
  // Each area's loader, with its standard, in every session that works in the area (Issue-364).
  // A session in the client or the hub loads `packages/AGENTS.md` too, so pays for both.
  // Lowered from 36_000 when typescript.md's detail on dependencies and lint moved to
  // typescript-dependencies.md, which nothing loads, leaving room for new rules (Issue-375).
  "packages/AGENTS.md": 30_000,
  // Raised from 25_000 for rule 17's tokens the art build writes and the two rules of PR-389's review (Issue-385).
  "packages/client/AGENTS.md": 25_500,
  "packages/hub/AGENTS.md": 28_000,
  "terraform/AGENTS.md": 14_000,
};

/** How many imports deep Claude Code follows. */
const DEPTH = 4;

/** An import is `@` and a path to a Markdown file, standing where a word starts. */
const IMPORT = /(?<![\w@/.-])@([\w./~-]+\.md)\b/g;

/** A document's text without its fenced blocks and its code spans, where an `@path` is only text. */
const withoutCode = (text) => text.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "").replace(/`[^`\n]*`/g, "");

/**
 * The loader and every document it imports, each once, in the order met.
 * `read` returns a file's text by its path from the repository's root, and
 * throws when there is no such file.
 */
export function loadedDocuments(loader, read) {
  const documents = [];
  const seen = new Set();
  const visit = (path, importer, depth) => {
    if (seen.has(path)) return;
    seen.add(path);
    let text;
    try {
      text = read(path);
    } catch (error) {
      if (importer === undefined) throw error;
      throw new Error(`${importer} imports ${path}, which cannot be read`, { cause: error });
    }
    documents.push({ bytes: Buffer.byteLength(text, "utf8"), path });
    if (depth === DEPTH) return;
    for (const [, imported] of withoutCode(text).matchAll(IMPORT)) {
      if (imported.startsWith("~") || imported.startsWith("/")) continue;
      visit(posix.join(posix.dirname(path), imported), path, depth + 1);
    }
  };
  visit(loader, undefined, 0);
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
