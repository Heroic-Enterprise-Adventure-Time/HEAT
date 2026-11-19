// The trace report's arithmetic and its reading of a kept report, with no AWS:
// the traces here are written in the shape X-Ray returns one, which
// scripts/trace-report.mjs describes. Run by `npm test` (test:scripts).
import assert from "node:assert/strict";
import { test } from "node:test";

import { buildReport, callsText, parseReport, renderReport, requestFromTrace, requestsFromLog } from "./trace-report.mjs";

const VERSION = "c09b3810e5a2527b46ade6fd9d63b572ab0e838e";
const OTHER = "fd16e058dae8faf529417db97de8731a44605732";

const call = (name) => ({ annotations: { "span.kind": "CLIENT", "span.name": name }, name: name.split(".")[0], namespace: "aws" });
const field = (name, calls = [], version = VERSION) => ({
  annotations: { "graphql.field.name": name.split(".")[1], "heat.version": version },
  name,
  subsegments: calls.map(call),
});

/** A trace as xray:BatchGetTraces returns it: Lambda's two segments, the hub's, and one inferred for a table. */
function trace(id, ms, subsegments) {
  const hub = { annotations: { "span.kind": "SERVER" }, end_time: 100 + ms / 1000, name: "heat-hub", start_time: 100, subsegments };
  const documents = [{ name: "heat-dev-hub", origin: "AWS::Lambda" }, { name: "heat-dev-hub", origin: "AWS::Lambda::Function" }, hub, { name: "DynamoDB", origin: "AWS::DynamoDB" }];
  return { Id: id, Segments: documents.map((document) => ({ Document: JSON.stringify(document) })) };
}

const logLine = (traceId, extra = {}) => JSON.stringify({ errors: 0, function_arn: "arn:aws:lambda:us-east-1:000000000000:function:heat-dev-hub:live", message: "graphql request", xray_trace_id: traceId, ...extra });

test("the log's requests are the live alias's request lines", () => {
  const requests = requestsFromLog([
    logLine("1-a"),
    logLine("1-b", { errors: 2 }),
    logLine("1-c", { function_arn: "arn:aws:lambda:us-east-1:000000000000:function:heat-dev-hub:previous" }),
    JSON.stringify({ message: "graphql error", xray_trace_id: "1-d" }),
    "REPORT RequestId: not json",
  ]);
  assert.deepEqual(requests, [
    { errors: 0, traceId: "1-a" },
    { errors: 2, traceId: "1-b" },
  ]);
});

test("a request is named for its root fields and counted by its calls, wherever they were made", () => {
  const nested = { name: "a span of our own", subsegments: [call("S3.GetObject")] };
  const found = requestFromTrace(trace("1-a", 48, [field("Query.adventure", ["DynamoDB.GetItem"]), nested]));
  assert.equal(found.name, "Query.adventure");
  assert.deepEqual(found.calls, { "DynamoDB.GetItem": 1, "S3.GetObject": 1 });
  assert.deepEqual(found.versions, [VERSION]);
  assert.ok(Math.abs(found.ms - 48) < 0.001);
});

test("two root fields make one name, a request with none says so, and a trace without the hub's span is not yet a request", () => {
  assert.equal(requestFromTrace(trace("1-a", 5, [field("Query.me"), field("Query.heroesSeenAt")])).name, "Query.heroesSeenAt + Query.me");
  assert.equal(requestFromTrace(trace("1-b", 5, [])).name, "(no root field)");
  assert.equal(requestFromTrace({ Id: "1-c", Segments: [{ Document: JSON.stringify({ name: "heat-dev-hub", origin: "AWS::Lambda" }) }] }), undefined);
});

test("calls read in the order of their names", () => {
  assert.equal(callsText({ "S3.PutObject": 1, "DynamoDB.GetItem": 2 }), "DynamoDB.GetItem 2, S3.PutObject 1");
  assert.equal(callsText({}), "none");
});

function sampleReport() {
  const traces = new Map([
    ["1-a", trace("1-a", 10, [field("Mutation.startAdventure", ["DynamoDB.GetItem", "DynamoDB.GetItem"])])],
    ["1-b", trace("1-b", 30, [field("Mutation.startAdventure", ["DynamoDB.GetItem", "DynamoDB.GetItem"])])],
    ["1-c", trace("1-c", 70, [field("Mutation.startAdventure", ["DynamoDB.GetItem", "DynamoDB.GetItem", "DynamoDB.TransactWriteItems"])])],
    ["1-d", trace("1-d", 1, [field("Query.version", [], OTHER)])],
    ["1-e", trace("1-e", 2, [field("Query.version")])],
  ]);
  const requests = ["1-a", "1-b", "1-c", "1-d", "1-e", "1-missing"].map((traceId) => ({ errors: 0, traceId }));
  return buildReport({ requests, runId: 7, since: 1, stack: "heat-sb328", traces, version: VERSION });
}

test("a report has one row for each shape of each request, with its median, and leaves out another deploy's answers", () => {
  const report = sampleReport();
  assert.equal(report.logged, 6);
  assert.equal(report.traced, 5);
  assert.equal(report.otherVersion, 1);
  assert.deepEqual(report.rows, [
    { calls: { "DynamoDB.GetItem": 2 }, medianMs: 20, request: "Mutation.startAdventure", requests: 2 },
    { calls: { "DynamoDB.GetItem": 2, "DynamoDB.TransactWriteItems": 1 }, medianMs: 70, request: "Mutation.startAdventure", requests: 1 },
    { calls: {}, medianMs: 2, request: "Query.version", requests: 1 },
  ]);
});

test("a kept report is read back, and one this script did not write is refused whole", () => {
  const report = sampleReport();
  assert.deepEqual(parseReport(JSON.stringify(report)), report);
  const withRow = (row) => JSON.stringify({ ...report, rows: [{ ...report.rows[0], ...row }] });
  assert.equal(parseReport("not json"), undefined);
  assert.equal(parseReport("null"), undefined);
  assert.equal(parseReport(JSON.stringify({ ...report, format: 2 })), undefined);
  assert.equal(parseReport(JSON.stringify({ ...report, stack: "heat-dev` [x](https://example.com)" })), undefined);
  assert.equal(parseReport(JSON.stringify({ ...report, version: "main" })), undefined);
  assert.equal(parseReport(JSON.stringify({ ...report, runId: "7/../8" })), undefined);
  assert.equal(parseReport(withRow({ request: "Query.me | <img src=x>" })), undefined);
  assert.equal(parseReport(withRow({ calls: { "DynamoDB.GetItem | x": 1 } })), undefined);
  assert.equal(parseReport(withRow({ calls: { "DynamoDB.GetItem": "2" } })), undefined);
  assert.equal(parseReport(withRow({ medianMs: "fast" })), undefined);
});

test("alone, the report is a table of its rows", () => {
  const markdown = renderReport(sampleReport());
  assert.match(markdown, /5 of 6 requests the hub logged since the stack test began were traced; 1 of them was answered by another deploy and left out\./);
  assert.match(markdown, /No kept report to set beside it\./);
  assert.match(markdown, /\| `Mutation\.startAdventure` \| DynamoDB\.GetItem 2 \| 2 \| 20 ms \|/);
  assert.ok(markdown.includes("\n|  | DynamoDB.GetItem 2, DynamoDB.TransactWriteItems 1 | 1 | 70 ms |\n"));
  assert.match(markdown, /\| `Query\.version` \| none \| 1 \| 2\.0 ms \|/);
});

test("beside a kept report, a shape only this run has is in bold and one only the other has is a dash here", () => {
  const report = sampleReport();
  const baseline = {
    ...report,
    rows: [
      { calls: { "DynamoDB.GetItem": 2 }, medianMs: 18, request: "Mutation.startAdventure", requests: 2 },
      { calls: { "DynamoDB.GetItem": 1, "DynamoDB.TransactWriteItems": 1 }, medianMs: 60, request: "Mutation.startAdventure", requests: 1 },
    ],
    runId: 44246726194,
    stack: "heat-dev",
    version: OTHER,
  };
  const markdown = renderReport(report, { baseline, repositoryUrl: "https://github.com/o/r" });
  assert.match(markdown, /Beside them, `heat-dev` at `fd16e05` \(\[its run\]\(https:\/\/github\.com\/o\/r\/actions\/runs\/44246726194\)\)/);
  assert.match(markdown, /\| `Mutation\.startAdventure` \| DynamoDB\.GetItem 1, DynamoDB\.TransactWriteItems 1 \| - \| 1, 60 ms \|/);
  assert.ok(markdown.includes("\n|  | DynamoDB.GetItem 2 | 2, 20 ms | 2, 18 ms |\n"));
  assert.ok(markdown.includes("\n|  | DynamoDB.GetItem 2, DynamoDB.TransactWriteItems 1 | **1, 70 ms** | - |\n"));
  assert.match(markdown, /\| `Query\.version` \| none \| \*\*1, 2\.0 ms\*\* \| - \|/);
});

test("a failed test names the last request's trace, and a request that logged errors is always named", () => {
  const requests = [
    { errors: 0, traceId: "1-a" },
    { errors: 3, traceId: "1-b" },
    { errors: 0, traceId: "1-c" },
  ];
  const passed = renderReport(sampleReport(), { requests });
  assert.match(passed, /Requests that logged errors: `1-b` \(3\)\./);
  assert.doesNotMatch(passed, /failed/);
  const failed = renderReport(sampleReport(), { failed: true, requests });
  assert.match(failed, /The stack test or the browser test failed\. The last request the hub logged is trace `1-c`\./);
  assert.match(failed, /aws xray batch-get-traces --trace-ids <id>/);
  assert.doesNotMatch(renderReport(sampleReport(), { requests: [requests[0]] }), /batch-get-traces/);
});

test("a run with no request says so", () => {
  const report = buildReport({ requests: [], runId: 7, since: 1, stack: "heat-sb328", traces: new Map(), version: VERSION });
  assert.match(renderReport(report), /0 of 0 requests[^\n]*\n\nNo trace to report for this run\./);
});
