import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

/**
 * The trace report (decision 0056): what each request of a run did, read from
 * the run's traces and written beside the cold start, for a reviewer to read
 * next to the diff. It is the sibling of scripts/report-cold-start.sh and runs
 * in the same job, under the role, so it uses nothing but Node and the AWS CLI
 * (docs/process/best-practices.md, rule 13).
 *
 * The function's log is the list of requests: the hub writes one "graphql
 * request" line for each, with its trace id (packages/hub/src/observability.ts),
 * and the traces are fetched by those ids, five to a call, which is the most
 * xray:BatchGetTraces takes. A request is named for the root fields it ran,
 * `Mutation.startAdventure`, and described by its calls to AWS, counted by
 * operation, `DynamoDB.GetItem 2`. One row of the report is one such shape of
 * one request, because a refusal and a success of the same field make
 * different calls and take different times.
 *
 * The report is kept as JSON by the run of `dev` (the workflow's artifact
 * `trace-report`), and a later run reads the last one kept as its baseline:
 * a branch's run beside `dev`, and `dev`'s run beside its own previous one.
 *
 * Nothing of a request is printed: a log line holds the function's ARN, and
 * with it the account's id, so the lines themselves never reach the output.
 *
 * Usage: node scripts/trace-report.mjs --stack <name> --since <epoch ms>
 *          --markdown <file> [--out <file>] [--version <commit>]
 *          [--baseline <file>] [--failed]
 *   --stack     heat-sb<issue> or heat-dev; the log group is /aws/lambda/<stack>-hub
 *   --since     when the stack test began, in epoch milliseconds
 *   --markdown  where the report is written as Markdown
 *   --out       where the report is written as JSON, to be kept
 *   --version   the deploy's commit; a request answered by another is left out
 *   --baseline  a kept report to set beside this one; a missing file is no baseline
 *   --failed    the stack test or the browser test failed: name the last request's trace
 */

/** The version of the kept report's shape; a kept report of another is not read. */
export const FORMAT = 1;

const REQUEST_NAME = /^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*( \+ [A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const CALL_NAME = /^[A-Za-z0-9]+\.[A-Za-z0-9]+$/;
const STACK_NAME = /^heat-[a-z0-9-]+$/;
const COMMIT = /^[0-9a-f]{40}$/;
const NO_ROOT_FIELD = "(no root field)";

/**
 * The requests the hub logged, from its log lines. A request the `previous`
 * alias answered is the deploy before this one (decision 0030) and is left
 * out; a line that is not JSON, or not a request's, is skipped.
 */
export function requestsFromLog(messages) {
  const requests = [];
  for (const message of messages) {
    let line;
    try {
      line = JSON.parse(message);
    } catch {
      continue;
    }
    if (line?.message !== "graphql request" || typeof line.xray_trace_id !== "string") continue;
    if (typeof line.function_arn === "string" && line.function_arn.endsWith(":previous")) continue;
    requests.push({ errors: Number(line.errors) || 0, traceId: line.xray_trace_id });
  }
  return requests;
}

/**
 * What one trace says its request did, or undefined while the hub's own span
 * has not arrived. The hub's span is the segment the OpenTelemetry layer
 * sends, of kind SERVER; under it are a span for each root field (decision
 * 0055) and one for each call to AWS, in the `aws` namespace, wherever in the
 * tree it was made: a field below the root runs after the root field's span
 * has ended, so its calls are the request's and not that span's.
 */
export function requestFromTrace(trace) {
  for (const segment of trace.Segments ?? []) {
    const document = JSON.parse(segment.Document);
    if (document.annotations?.["span.kind"] !== "SERVER") continue;
    const fields = [];
    const versions = new Set();
    const calls = {};
    const walk = (node) => {
      for (const child of node.subsegments ?? []) {
        if (child.annotations?.["graphql.field.name"] !== undefined) {
          fields.push(String(child.name));
          if (child.annotations["heat.version"] !== undefined) versions.add(String(child.annotations["heat.version"]));
        }
        if (child.namespace === "aws") {
          const name = String(child.annotations?.["span.name"] ?? child.name);
          calls[name] = (calls[name] ?? 0) + 1;
        }
        walk(child);
      }
    };
    walk(document);
    return {
      calls,
      ms: (document.end_time - document.start_time) * 1000,
      name: fields.length > 0 ? fields.sort().join(" + ") : NO_ROOT_FIELD,
      versions: [...versions],
    };
  }
  return undefined;
}

/** A request's calls as one line, `DynamoDB.GetItem 2, S3.PutObject 1`, operations in order; `none` for no call. */
export function callsText(calls) {
  const names = Object.keys(calls).sort();
  return names.length > 0 ? names.map((name) => `${name} ${calls[name]}`).join(", ") : "none";
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * The report of one run. `requests` are the log's, `traces` what X-Ray
 * returned for them, keyed by trace id. A request whose root fields carry
 * another deploy's version is counted and left out of the rows: after an
 * apply the previous deploy can answer the live alias for a minute
 * (docs/process/development.md, "Why").
 */
export function buildReport({ requests, runId, since, stack, traces, version }) {
  const shapes = new Map();
  let traced = 0;
  let otherVersion = 0;
  for (const request of requests) {
    const trace = traces.get(request.traceId);
    const found = trace === undefined ? undefined : requestFromTrace(trace);
    if (found === undefined) continue;
    traced += 1;
    if (version !== undefined && found.versions.some((v) => v !== version)) {
      otherVersion += 1;
      continue;
    }
    const key = `${found.name}\n${callsText(found.calls)}`;
    const shape = shapes.get(key) ?? { calls: found.calls, ms: [], request: found.name };
    shape.ms.push(found.ms);
    shapes.set(key, shape);
  }
  const rows = [...shapes.values()]
    .map((shape) => ({ calls: shape.calls, medianMs: Math.round(median(shape.ms) * 10) / 10, request: shape.request, requests: shape.ms.length }))
    .sort((a, b) => a.request.localeCompare(b.request, "en") || b.requests - a.requests || callsText(a.calls).localeCompare(callsText(b.calls), "en"));
  return { format: FORMAT, logged: requests.length, otherVersion, rows, runId, since, stack, traced, version };
}

/**
 * A kept report, read as data: it comes from another run's artifact, so
 * every value that would reach the page is checked to be what this script
 * writes, and a report that is not is refused whole.
 */
export function parseReport(text) {
  let report;
  try {
    report = JSON.parse(text);
  } catch {
    return undefined;
  }
  const count = (value) => Number.isInteger(value) && value >= 0;
  if (report?.format !== FORMAT || !STACK_NAME.test(report.stack) || !COMMIT.test(report.version)) return undefined;
  if (!count(report.runId) || !count(report.logged) || !count(report.traced) || !Array.isArray(report.rows)) return undefined;
  for (const row of report.rows) {
    if (row.request !== NO_ROOT_FIELD && !REQUEST_NAME.test(row.request)) return undefined;
    if (!count(row.requests) || typeof row.medianMs !== "number" || !Number.isFinite(row.medianMs)) return undefined;
    if (row.calls === null || typeof row.calls !== "object") return undefined;
    for (const [name, calls] of Object.entries(row.calls)) {
      if (!CALL_NAME.test(name) || !count(calls)) return undefined;
    }
  }
  return report;
}

const milliseconds = (ms) => `${ms < 10 ? ms.toFixed(1) : ms.toFixed(0)} ms`;
const requestCell = (name) => (name === NO_ROOT_FIELD ? name : `\`${name}\``);

/**
 * The report as Markdown. With a baseline the table is the union of both
 * runs' rows, so a shape that changed shows as two rows of one request, one
 * with a figure on each side; a row only this run has is in bold. `requests`
 * are the log's, from which a request that logged errors is named by its
 * trace, and the last one when the tests failed.
 */
export function renderReport(report, { baseline, failed = false, repositoryUrl, requests = [] } = {}) {
  const lines = ["### Traces: what each request did", ""];
  const of = `${report.traced} of ${report.logged} requests the hub logged since the stack test began were traced`;
  const left = report.otherVersion > 0 ? `; ${report.otherVersion} of them ${report.otherVersion === 1 ? "was" : "were"} answered by another deploy and left out` : "";
  lines.push(`${of}${left}.`);

  if (report.rows.length === 0) {
    lines.push("", "No trace to report for this run.");
  } else if (baseline === undefined) {
    lines.push("No kept report to set beside it.", "");
    lines.push("| Request | Calls to AWS in one request | Requests | Median |", "| --- | --- | --- | --- |");
    let previous;
    for (const row of report.rows) {
      lines.push(`| ${row.request === previous ? "" : requestCell(row.request)} | ${callsText(row.calls)} | ${row.requests} | ${milliseconds(row.medianMs)} |`);
      previous = row.request;
    }
  } else {
    const there = `\`${baseline.stack}\` at \`${baseline.version.slice(0, 7)}\``;
    const run = repositoryUrl === undefined ? "" : ` ([its run](${repositoryUrl}/actions/runs/${baseline.runId}))`;
    lines.push(`Beside them, ${there}${run}: a row only this run has is in bold, and a dash is a shape one of the two did not take.`, "");
    lines.push(`| Request | Calls to AWS in one request | This run: requests, median | ${there}: requests, median |`, "| --- | --- | --- | --- |");
    const key = (row) => `${row.request}\n${callsText(row.calls)}`;
    const mine = new Map(report.rows.map((row) => [key(row), row]));
    const theirs = new Map(baseline.rows.map((row) => [key(row), row]));
    const union = [...new Set([...mine.keys(), ...theirs.keys()])].sort((a, b) => a.localeCompare(b, "en"));
    const cell = (row) => (row === undefined ? "-" : `${row.requests}, ${milliseconds(row.medianMs)}`);
    let previous;
    for (const k of union) {
      const [request, calls] = k.split("\n");
      const here = mine.get(k);
      const other = theirs.get(k);
      const hereCell = here !== undefined && other === undefined ? `**${cell(here)}**` : cell(here);
      lines.push(`| ${request === previous ? "" : requestCell(request)} | ${calls} | ${hereCell} | ${cell(other)} |`);
      previous = request;
    }
  }

  const erred = requests.filter((request) => request.errors > 0);
  if (erred.length > 0) {
    lines.push("", `Requests that logged errors: ${erred.map((request) => `\`${request.traceId}\` (${request.errors})`).join(", ")}.`);
  }
  if (failed && requests.length > 0) {
    lines.push("", `The stack test or the browser test failed. The last request the hub logged is trace \`${requests[requests.length - 1].traceId}\`.`);
  }
  if (erred.length > 0 || (failed && requests.length > 0)) {
    lines.push("A trace is read through the plan role, `aws xray batch-get-traces --trace-ids <id>` (`docs/process/development.md`, rule 7).");
  }
  return `${lines.join("\n")}\n`;
}

// ------------------------------------------------------------ the AWS CLI --

const aws = (args) => JSON.parse(execFileSync("aws", [...args, "--output", "json"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }));

function readLog(logGroup, since) {
  const messages = aws(["logs", "filter-log-events", "--log-group-name", logGroup, "--start-time", String(since), "--filter-pattern", '{ $.message = "graphql request" }', "--query", "events[].message"]);
  return requestsFromLog(messages ?? []);
}

/** Fetches the traces not yet held whole, five ids to a call. */
function fetchTraces(ids, traces) {
  const missing = ids.filter((id) => !traces.has(id) || requestFromTrace(traces.get(id)) === undefined);
  for (let i = 0; i < missing.length; i += 5) {
    const answer = aws(["xray", "batch-get-traces", "--trace-ids", ...missing.slice(i, i + 5)]);
    for (const trace of answer.Traces ?? []) traces.set(trace.Id, trace);
  }
  return ids.filter((id) => !traces.has(id) || requestFromTrace(traces.get(id)) === undefined).length;
}

function parseArguments(argv) {
  const options = { failed: false };
  for (let i = 0; i < argv.length; i += 1) {
    const name = argv[i];
    if (name === "--failed") options.failed = true;
    else if (["--baseline", "--markdown", "--out", "--since", "--stack", "--version"].includes(name)) options[name.slice(2)] = argv[(i += 1)];
    else throw new Error(`unknown argument ${name}`);
  }
  if (!options.stack || !options.since || !options.markdown) {
    throw new Error("usage: node scripts/trace-report.mjs --stack <name> --since <epoch ms> --markdown <file> [--out <file>] [--version <commit>] [--baseline <file>] [--failed]");
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const logGroup = `/aws/lambda/${options.stack}-hub`;
  const since = Number(options.since);

  // The log and the traces both lag the requests by seconds: read until every
  // logged request's trace holds the hub's span, for up to a minute.
  let requests = [];
  const traces = new Map();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (attempt > 0) await sleep(5000);
    requests = readLog(logGroup, since);
    if (requests.length === 0) continue;
    if (fetchTraces(requests.map((request) => request.traceId), traces) === 0) break;
  }

  const report = buildReport({ requests, runId: Number(process.env.GITHUB_RUN_ID ?? 0), since, stack: options.stack, traces, version: options.version });
  const baseline = options.baseline !== undefined && existsSync(options.baseline) ? parseReport(readFileSync(options.baseline, "utf8")) : undefined;
  if (options.baseline !== undefined && existsSync(options.baseline) && baseline === undefined) {
    console.error("the kept report is not one this script writes; reporting without it");
  }
  const repositoryUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}` : undefined;
  const markdown = renderReport(report, { baseline, failed: options.failed, repositoryUrl, requests });

  for (const [file, text] of [[options.markdown, markdown], [options.out, `${JSON.stringify(report, null, 2)}\n`]]) {
    if (file === undefined) continue;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  process.stdout.write(markdown);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
