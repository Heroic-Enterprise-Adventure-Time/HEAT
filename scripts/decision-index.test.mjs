// That the index of docs/decisions/README.md says of each record what the
// record's own Status line says (docs/decisions/README.md, rules 7 and 11):
// the status word, with "amended" after it when the line says more. Read from
// the tree. Run by `npm test` (test:scripts).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const decisions = fileURLToPath(new URL("../docs/decisions/", import.meta.url));

const STATUS_WORD = /^(Decided|Working assumption|Superseded by \d{4})(.*)$/s;

/** What a record's index row reads, from the text after `**Status:**`. */
function indexStatus(statusLine) {
  const match = STATUS_WORD.exec(statusLine.trim());
  assert.ok(match, `a Status line opens with Decided, Working assumption or Superseded by a number: ${statusLine}`);
  const [, word, rest] = match;
  const more = rest.replace(/^[;.,]\s*/, "").trim();
  // Rule 11: a decision not yet built says so on its Status line, and its row reads the word alone.
  return more === "" || more.startsWith("not built:") ? word : `${word}, amended`;
}

function recordStatuses() {
  const statuses = new Map();
  for (const file of readdirSync(decisions).filter((name) => /^\d{4}-.+\.md$/.test(name))) {
    const line = /^- \*\*Status:\*\* (.+)$/m.exec(readFileSync(`${decisions}${file}`, "utf8"));
    assert.ok(line, `${file} has a Status line`);
    statuses.set(file, indexStatus(line[1]));
  }
  return statuses;
}

function indexRows() {
  const rows = new Map();
  for (const line of readFileSync(`${decisions}README.md`, "utf8").split("\n")) {
    const row = /^\| \[\d{4}\]\((\d{4}-[^)]+\.md)\) \|.*\| ([^|]+) \|$/.exec(line.trim());
    if (row) rows.set(row[1], row[2].trim());
  }
  return rows;
}

test("the status word, and amended only when the Status line says more", () => {
  assert.equal(indexStatus("Decided"), "Decided");
  assert.equal(indexStatus("Decided; not built: the nav by Issue-386"), "Decided");
  assert.equal(indexStatus("Decided; built by Issue-385."), "Decided, amended");
  assert.equal(indexStatus("Decided. Amended by 0017 on 2026-10-16: an environment"), "Decided, amended");
  assert.equal(indexStatus("Working assumption"), "Working assumption");
  assert.equal(indexStatus("Superseded by 0012"), "Superseded by 0012");
  assert.throws(() => indexStatus("Open"));
});

test("every record has a row in the index, and every row a record", () => {
  assert.deepEqual([...indexRows().keys()].sort(), [...recordStatuses().keys()].sort());
});

test("each row's status is its record's", () => {
  const rows = indexRows();
  const disagreements = [...recordStatuses()]
    .filter(([file, status]) => rows.get(file) !== status)
    .map(([file, status]) => `${file}: the index says "${rows.get(file)}", the record's Status line makes it "${status}"`);
  assert.deepEqual(disagreements, []);
});
