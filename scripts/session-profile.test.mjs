// The session profiler's arithmetic and what it prints, on a transcript
// written here in the shape Claude Code writes one, which
// scripts/session-profile.mjs describes. Run by `npm test` (test:scripts).
import assert from "node:assert/strict";
import { test } from "node:test";

import { areaOf, buildProfile, commandKey, readTranscript, renderProfile, shortPath } from "./session-profile.mjs";

/** Text no output may hold: it stands for a message, a file and a command's output. */
const CONTENT = "SECRET";
const HOME = "C:\\Users\\someone";

const at = (minutes) => new Date(Date.parse("2026-11-25T10:00:00.000Z") + minutes * 60_000).toISOString();
const usage = (read, write, output) => ({ cache_creation_input_tokens: write, cache_read_input_tokens: read, input_tokens: 0, output_tokens: output });
const call = (id, minutes, used, content = []) => ({ message: { content, id, model: "claude-test", usage: used }, timestamp: at(minutes), type: "assistant" });
const use = (id, name, input) => ({ id, input, name, type: "tool_use" });
const result = (id, minutes, text) => ({ message: { content: [{ content: text, tool_use_id: id, type: "tool_result" }], role: "user" }, timestamp: at(minutes), type: "user" });

/**
 * Four calls. The first writes a context of 100,000. A document of 3,000
 * characters is read before the second and a file through `sed` before the
 * third; the session is then compacted from a summary written while it was
 * idle, and the fourth call, two hours later, writes 60,000.
 */
const records = [
  { shape: { system: ["s".repeat(1_000)], tools: [{ description: "a".repeat(3_000), name: "Artifact" }, { description: "b".repeat(500), name: "Bash" }] }, type: "api-request-shape" },
  { attachment: { files: [{ content: CONTENT.repeat(400) }], type: "instructions" }, timestamp: at(0), type: "attachment" },
  { attachment: { content: "c".repeat(700), names: ["docx"], type: "skill_listing" }, timestamp: at(0), type: "attachment" },
  { attachment: { systemPrompt: CONTENT.repeat(9_000), type: "prompt_snapshot" }, timestamp: at(0), type: "attachment" },
  { message: { content: `${CONTENT} work on the issue`, role: "user" }, timestamp: at(0), type: "user" },
  call("m1", 1, usage(0, 100_000, 100), [use("t1", "Read", { file_path: `${HOME}\\IdeaProjects\\HEAT-9\\docs\\design\\game.md` })]),
  // A streamed response is recorded more than once, with the same id.
  call("m1", 1, usage(0, 100_000, 100)),
  result("t1", 1, CONTENT.repeat(500)),
  call("m2", 2, usage(100_000, 1_100, 100), [use("t2", "Bash", { command: `builtin cd ${HOME}/x && sed -n 1,5p ${CONTENT}.ts` })]),
  result("t2", 2, CONTENT.repeat(50)),
  // A subagent's call is another conversation.
  { ...call("side", 2, usage(0, 900_000, 9_000)), isSidechain: true },
  call("m3", 3, usage(101_100, 400, 50), [use("t3", "Bash", { command: `cat ${CONTENT}.md` })]),
  // What this returns is summarized away by the compaction before any call reads it.
  result("t3", 3, CONTENT.repeat(2_000)),
  { compactMetadata: { precomputed: true, preTokens: 101_500, trigger: "auto" }, subtype: "compact_boundary", timestamp: at(123), type: "system" },
  { isCompactSummary: true, message: { content: `${CONTENT} summary`, role: "user" }, timestamp: at(58), type: "user" },
  call("m4", 123, usage(0, 60_000, 10)),
  { customTitle: "Issue-9: a test", type: "custom-title" },
];
const transcript = () => readTranscript(records.map((record) => JSON.stringify(record)).join("\n") + "\nnot a record\n");

test("a call is one response, and a subagent's are left out", () => {
  const profile = buildProfile(transcript());
  assert.equal(profile.calls, 4);
  assert.equal(profile.title, "Issue-9: a test");
  assert.deepEqual(profile.context.first, 100_000);
  assert.deepEqual(profile.context.max, 101_500);
  assert.deepEqual(profile.context.last, 60_000);
  assert.deepEqual(profile.tokens, { cacheRead: 201_100, cacheWrite: 161_500, fresh: 0, output: 260 });
});

test("a compaction is read with where its summary came from", () => {
  const profile = buildProfile(transcript());
  assert.deepEqual(profile.compactions, [{ beforeCall: 4, from: 101_500, idle: true, to: 60_000, trigger: "auto" }]);
});

test("growth is given to what entered, weighed by the calls that carried it", () => {
  const { groups } = buildProfile(transcript());
  const by = Object.fromEntries(groups.map((group) => [group.what.split(":")[0], group]));
  // Baseline 100,000 x 4 calls; the document 1,000 x 2, until the compaction;
  // the model's 100 x 2 and 100 x 1; the file read through sed 300 x 1.
  const all = 400_000 + 2_000 + 300 + 300;
  assert.equal(by["documents read on demand"].tokens, 1_000);
  assert.equal(by["documents read on demand"].share, 2_000 / all);
  assert.equal(by["files read through Bash (sed, grep, cat)"].tokens, 300);
  assert.equal(by["files read through Bash (sed, grep, cat)"].share, 300 / all);
  assert.equal(by["written by the model"].tokens, 200);
  assert.equal(by["the baseline"].share, 400_000 / all);
  assert.ok(Math.abs(groups.reduce((sum, group) => sum + group.share, 0) - 1) < 1e-9);
});

test("what a tool returned just before a compaction is carried by no call", () => {
  const { keys } = buildProfile(transcript());
  const share = (name) => keys.find((key) => key.name === name).share;
  assert.equal(share("result Bash: cat"), 0);
  assert.ok(share("result Read: HEAT-9/docs/design/game.md") > 0);
});

test("a session of fewer than ten calls is sliced by call, each call once", () => {
  const { tenths } = buildProfile(transcript()).context;
  assert.deepEqual(
    tenths.map(({ from, to }) => [from, to]),
    [
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ],
  );
  assert.ok(Math.abs(tenths.reduce((sum, tenth) => sum + tenth.share, 0) - 1) < 1e-9);
});

test("a response with no id is a call of its own", () => {
  const anonymous = (minutes) => JSON.stringify({ message: { content: [], model: "claude-test", usage: usage(0, 10, 1) }, timestamp: at(minutes), type: "assistant" });
  assert.equal(buildProfile(readTranscript([anonymous(1), anonymous(2)].join("\n"))).calls, 2);
});

test("the cost is weighed at the API's ratios, and a large cache write is listed with its pause", () => {
  const profile = buildProfile(transcript());
  const weighed = 201_100 * 0.1 + 161_500 * 2 + 260 * 5;
  assert.equal(profile.cost.cacheRead, (201_100 * 0.1) / weighed);
  assert.deepEqual(
    profile.writes.map(({ call: number, pauseMinutes, tokens }) => ({ number, pauseMinutes, tokens })),
    [
      { number: 1, pauseMinutes: 0, tokens: 100_000 },
      { number: 4, pauseMinutes: 120, tokens: 60_000 },
    ],
  );
});

test("the baseline is split into the request's parts, and what is not sent is left out", () => {
  const { baseline } = buildProfile(transcript());
  assert.equal(baseline.tokens, 100_000);
  const names = baseline.parts.map((part) => `${part.what}${part.name === "" ? "" : `: ${part.name}`}`);
  assert.deepEqual(names.slice(0, 2), ["a tool's schema: Artifact", "sent with the first message: instructions"]);
  assert.ok(names.includes("the system prompt"));
  assert.ok(names.includes("the first message"));
  assert.ok(!names.some((name) => name.includes("prompt_snapshot")));
  // A listing is counted as it is sent, its content, and not as it is recorded.
  assert.equal(baseline.parts.find((part) => part.name === "skill_listing").chars, 700);
  assert.ok(Math.abs(baseline.parts.reduce((sum, part) => sum + part.share, 0) - 1) < 1e-9);
});

test("nothing of the conversation is printed, and no home directory", () => {
  const text = renderProfile(buildProfile(transcript()), { top: 5 });
  assert.ok(!text.includes(CONTENT));
  assert.ok(!text.includes("someone"));
  assert.match(text, /result Read: HEAT-9\/docs\/design\/game\.md/);
  assert.match(text, /result Bash: sed/);
  assert.match(text, /before call 4: 101,500 to 60,000, from a summary written while the session was idle/);
  assert.match(text, /session: Issue-9: a test/);
});

test("a transcript with no call is refused", () => {
  assert.throws(() => buildProfile(readTranscript("")), /no call/);
});

test("a command is named by its first word or two", () => {
  assert.equal(commandKey("builtin cd C:/x && git -C C:/y status --porcelain"), "git status");
  assert.equal(commandKey("MSYS_NO_PATHCONV=1 aws ssm get-parameter --name /heat/x"), "aws ssm");
  assert.equal(commandKey("gh pr view 12 --json title"), "gh pr view");
  assert.equal(commandKey("terraform -chdir=terraform/dev plan"), "terraform plan");
  assert.equal(commandKey("sed -n 1,40p file.ts"), "sed");
  assert.equal(commandKey(undefined), "");
});

test("a path is printed from the checkout down", () => {
  assert.equal(shortPath(`${HOME}\\IdeaProjects\\HEAT\\docs\\README.md`), "HEAT/docs/README.md");
  assert.equal(shortPath("/home/someone/.claude/projects/C--x/abc/tool-results/out.txt"), "transcripts/abc/tool-results/out.txt");
  assert.equal(shortPath(`${HOME}\\AppData\\Local\\Temp\\claude\\a\\b\\scratchpad\\body.md`), "scratchpad/body.md");
  assert.equal(shortPath(`${HOME}\\Downloads\\notes.txt`), "~/Downloads/notes.txt");
});

test("a file belongs to an area of the tree", () => {
  assert.equal(areaOf("HEAT/docs/design/game.md"), "docs/design");
  assert.equal(areaOf("HEAT/docs/README.md"), "docs/other");
  assert.equal(areaOf("HEAT/packages/engine/src/content.ts"), "packages/engine");
  assert.equal(areaOf("HEAT/packages/hub/src/camp.test.ts"), "packages tests");
  assert.equal(areaOf("HEAT/terraform/dev/README.md"), "terraform READMEs");
  assert.equal(areaOf("scratchpad/body.md"), "scratch and saved tool output");
});
