import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

/**
 * What a Claude Code session cost, read from its transcript (Issue-363):
 * how large the context was at each call, what filled it, and what each
 * thing cost by the number of calls that carried it.
 *
 * A transcript is one JSON record a line, under
 * `~/.claude/projects/<the checkout's path with - for each separator>/`.
 * Every call to the API is recorded with its usage, so the context of a call
 * is exact: its fresh input, what it read from the cache and what it wrote
 * to it. What filled the context is an estimate: the growth between two
 * calls, less what the model wrote, is split among the records that entered
 * between them by their size in characters.
 *
 * "Carried" is the measure that matters. Every call reads the whole context
 * again, so a thing costs its size times the calls made while it was in the
 * context, which ends at the next compaction or at the session's end.
 *
 * Of the conversation, one thing is printed: the session's title, which the
 * app may have made from the first message, so a profile is read before it
 * is posted. The rest is sizes, the names of tools, the paths of files and
 * the first word or two of a command, and no text of a message, a file or a
 * command's output.
 *
 *   node scripts/session-profile.mjs <transcript.jsonl> [--top 25]
 */

/** The API's price of each kind of token against fresh input; how a subscription weighs them is not published. */
export const PRICE = { cacheRead: 0.1, cacheWrite: 2, output: 5, fresh: 1 };

/** A call that wrote this many tokens to the cache rewrote most of a context: a lapsed cache, or a compaction. */
const LARGE_WRITE = 50_000;

/** An image's tokens are not in its record; it stands in the split as this many characters. */
const IMAGE_CHARS = 4_500;

/** Records the app keeps beside the conversation, which are not sent to the model. */
const NOT_CONTEXT = new Set(["attachment prompt_snapshot", "attachment deferred_tools_record", "attachment hook_success"]);

/** The commands whose second word says what they did. */
const TWO_WORDS = new Set(["gh", "git", "npm", "aws", "terraform", "npx", "docker"]);

const READS_FILES = /^Bash: (sed|grep|cat|head|tail|awk|ls|find|wc)$/;

/** A command as its first word or two, with the leading `cd` and the variables set for it dropped. */
export function commandKey(command) {
  const words = String(command ?? "")
    .trim()
    .replace(/^(builtin )?cd [^&;]+(&&|;)\s*/, "")
    .replace(/^([A-Z_]+=\S+\s+)+/, "")
    .split(/\s+/);
  const [first = "", second = "", third = "", fourth = ""] = words;
  if (!TWO_WORDS.has(first)) return first.length > 40 ? first.slice(-40) : first;
  if (first === "git" && second === "-C") return `git ${fourth}`;
  if (first === "gh") return `gh ${second} ${third}`.trimEnd();
  if (first === "terraform" && second.startsWith("-chdir")) return `terraform ${third}`;
  return `${first} ${second}`.trimEnd();
}

/** A path from the checkout or one of its worktrees down, so that no home directory is printed. */
export function shortPath(path) {
  return String(path ?? "")
    .replace(/\\/g, "/")
    .replace(/^.*\/\.claude\/projects\/[^/]+\//, "transcripts/")
    .replace(/^.*\/(HEAT[^/]*)\//, "$1/")
    .replace(/^.*scratchpad\//, "scratchpad/")
    .replace(/^([A-Za-z]:)?\/(Users|home)\/[^/]+\//, "~/");
}

/** The part of the tree a file read belongs to. */
export function areaOf(path) {
  const docs = /docs\/([^/]+)\//.exec(path);
  if (docs) return ["process", "standards", "architecture", "design", "decisions", "runbooks"].includes(docs[1]) ? `docs/${docs[1]}` : "docs/other";
  if (/docs\//.test(path)) return "docs/other";
  if (/terraform\//.test(path)) return /README/.test(path) ? "terraform READMEs" : "terraform code";
  const pkg = /packages\/([^/]+)\//.exec(path);
  if (pkg) return /\.(spec|test)\./.test(path) ? "packages tests" : `packages/${pkg[1]}`;
  if (/tool-results|scratchpad|Temp/.test(path)) return "scratch and saved tool output";
  if (/\.github\//.test(path)) return ".github";
  return "other";
}

const toolLabel = (name) => (name.startsWith("mcp__") ? name.replace(/^mcp__.*__/, "mcp:") : name);

function contentSize(content) {
  if (content === null || content === undefined) return { chars: 0, images: 0 };
  if (typeof content === "string") return { chars: content.length, images: 0 };
  if (!Array.isArray(content)) return { chars: JSON.stringify(content).length, images: 0 };
  let chars = 0;
  let images = 0;
  for (const block of content) {
    if (block.type === "text") chars += (block.text ?? "").length;
    else if (block.type === "image") images += 1;
    else if (block.type === "tool_reference") chars += 50;
    else chars += JSON.stringify(block).length;
  }
  return { chars, images };
}

/** An attachment's size as it is sent where its record says, and as it is recorded otherwise. */
function attachmentChars(attachment) {
  if (typeof attachment.content === "string") return attachment.content.length;
  const sent = attachment.addedLines ?? attachment.addedBlocks;
  if (Array.isArray(sent)) return sent.reduce((sum, entry) => sum + (typeof entry === "string" ? entry.length : JSON.stringify(entry).length), 0);
  return JSON.stringify(attachment).length;
}

function toolKey(block) {
  if (block.name === "Bash") return `Bash: ${commandKey(block.input?.command)}`;
  if (block.name === "Read" || block.name === "Edit" || block.name === "Write") return `${block.name}: ${shortPath(block.input?.file_path)}`;
  return block.name;
}

/**
 * The transcript's records as calls, the blocks that entered the context,
 * the compactions, and the first request's fixed part. A block's `at` is the
 * number of calls made before it, which is the index of the first call that
 * read it. A subagent's records are another conversation and are left out.
 */
export function readTranscript(text) {
  const calls = [];
  const callById = new Map();
  const blocks = [];
  const toolUses = new Map();
  const compactions = [];
  const baseline = [];
  let title = "";
  let images = 0;
  let requestShapeSeen = false;

  const compaction = (metadata) => {
    const last = compactions.at(-1);
    if (last?.beforeCall === calls.length) {
      if (metadata) Object.assign(last, metadata);
      return;
    }
    // What a tool returned after the last call and before this compaction was summarized away: no
    // call read it. The user's own message there is the one the next call answers, and is kept.
    for (const block of blocks) {
      if (block.at === calls.length && block.category !== "user text") block.dropped = true;
    }
    compactions.push({ beforeCall: calls.length, idle: false, trigger: "unknown", ...metadata });
  };

  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record.type === "custom-title" && typeof record.customTitle === "string") title = record.customTitle;
    if (record.type === "api-request-shape" && !requestShapeSeen) {
      requestShapeSeen = true;
      const shape = record.shape ?? {};
      baseline.push({ what: "the system prompt", name: "", chars: JSON.stringify(shape.system ?? "").length });
      for (const tool of shape.tools ?? []) baseline.push({ what: "a tool's schema", name: String(tool.name ?? tool.type ?? "?"), chars: JSON.stringify(tool).length });
    }
    if (record.isSidechain) continue;
    if (record.type === "system" && record.subtype === "compact_boundary") {
      const metadata = record.compactMetadata ?? {};
      compaction({ idle: metadata.precomputed === true, trigger: String(metadata.trigger ?? "unknown") });
    }
    if (record.isCompactSummary) compaction();

    const message = record.message;
    const at = calls.length;
    if (record.type === "assistant" && message) {
      // A streamed response is several records with one id; a record with no id is a call of its own.
      const id = message.id ?? record.uuid;
      let call = id === undefined ? undefined : callById.get(id);
      if (!call) {
        call = { model: message.model ?? "?", time: record.timestamp, usage: message.usage ?? {} };
        if (id !== undefined) callById.set(id, call);
        calls.push(call);
      } else if (message.usage) {
        call.usage = message.usage;
      }
      for (const block of message.content ?? []) {
        if (block.type !== "tool_use") continue;
        const key = toolKey(block);
        toolUses.set(block.id, { key, name: block.name });
        blocks.push({ at: calls.length, category: `call ${toolLabel(block.name)}`, chars: JSON.stringify(block.input ?? {}).length, key, written: true });
      }
    } else if (record.type === "user" && message) {
      if (typeof message.content === "string") {
        blocks.push({ at, category: "user text", chars: message.content.length, key: "" });
        continue;
      }
      let seen = 0;
      for (const block of message.content ?? []) {
        if (block.type === "tool_result") {
          const use = toolUses.get(block.tool_use_id) ?? { key: "?", name: "?" };
          const size = contentSize(block.content);
          seen += size.images;
          blocks.push({ at, category: `result ${toolLabel(use.name)}`, chars: size.chars, key: use.key });
        } else if (block.type === "text") {
          blocks.push({ at, category: record.isMeta ? "injected text" : "user text", chars: (block.text ?? "").length, key: "" });
        } else if (block.type === "image") {
          seen += 1;
        }
      }
      if (seen > 0) {
        images += seen;
        blocks.push({ at, category: "images", chars: IMAGE_CHARS * seen, key: "" });
      }
    } else if (record.type === "attachment") {
      const attachment = record.attachment ?? {};
      const kind = String(attachment.type ?? "?");
      const chars = attachmentChars(attachment);
      const category = `attachment ${kind}`;
      if (calls.length === 0 && !NOT_CONTEXT.has(category)) baseline.push({ what: "sent with the first message", name: kind, chars });
      blocks.push({ at, category, chars, key: kind });
    }
  }
  const firstMessage = blocks.filter((block) => block.at === 0 && (block.category === "user text" || block.category === "injected text")).reduce((sum, block) => sum + block.chars, 0);
  if (firstMessage > 0) baseline.push({ what: "the first message", name: "", chars: firstMessage });
  return { baseline, blocks, calls, compactions, images, title };
}

const contextOf = (usage) => (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);

/** The group a share of the context is reported under. */
function groupOf(block) {
  if (block.category === "result Read") {
    const area = areaOf(block.key);
    if (area.startsWith("docs/")) return "documents read on demand";
    if (area === "scratch and saved tool output") return "saved tool output read back";
    return "code read with Read";
  }
  if (block.category === "result Bash") {
    if (READS_FILES.test(block.key)) return "files read through Bash (sed, grep, cat)";
    if (/^Bash: (gh|git)/.test(block.key)) return "gh and git output";
    return "other command output";
  }
  if (block.category === "attachment nested_memory") return "documents read on demand";
  if (block.category === "images" || /browser|javascript/i.test(block.category)) return "browser and images";
  return "everything else";
}

/**
 * The profile of a transcript read by readTranscript: plain numbers, in the
 * order renderProfile prints them.
 */
export function buildProfile({ baseline, blocks, calls, compactions, images, title }) {
  const count = calls.length;
  if (count === 0) throw new Error("the transcript holds no call to the API");
  const context = calls.map((call) => contextOf(call.usage));
  const compactedBefore = new Map(compactions.map((entry) => [entry.beforeCall, entry]));
  /** The number of calls that read what entered at call `at`: up to the next compaction, or the end. */
  const carried = (at) => {
    let until = count;
    for (const { beforeCall } of compactions) {
      if (beforeCall > at && beforeCall < until) until = beforeCall;
    }
    return Math.max(0, until - at);
  };

  const models = {};
  const tokens = { cacheRead: 0, cacheWrite: 0, fresh: 0, output: 0 };
  for (const call of calls) {
    const entry = (models[call.model] ??= { calls: 0, cacheRead: 0, cacheWrite: 0, fresh: 0, output: 0 });
    const used = { cacheRead: call.usage.cache_read_input_tokens ?? 0, cacheWrite: call.usage.cache_creation_input_tokens ?? 0, fresh: call.usage.input_tokens ?? 0, output: call.usage.output_tokens ?? 0 };
    entry.calls += 1;
    for (const kind of Object.keys(used)) {
      entry[kind] += used[kind];
      tokens[kind] += used[kind];
    }
  }
  const weighed = Object.fromEntries(Object.keys(PRICE).map((kind) => [kind, tokens[kind] * PRICE[kind]]));
  const weighedSum = Object.values(weighed).reduce((sum, value) => sum + value, 0);
  const cost = Object.fromEntries(Object.entries(weighed).map(([kind, value]) => [kind, value / weighedSum]));

  const contextSum = context.reduce((sum, value) => sum + value, 0);
  // Ten slices of the session, or one a call where it made fewer than ten, so that no call is in two.
  const tenths = [];
  const slices = Math.min(10, count);
  for (let tenth = 0; tenth < slices; tenth++) {
    const from = Math.floor((tenth * count) / slices);
    const to = Math.floor(((tenth + 1) * count) / slices);
    const slice = context.slice(from, to);
    const sum = slice.reduce((total, value) => total + value, 0);
    tenths.push({ average: sum / slice.length, from: from + 1, share: sum / contextSum, to });
  }

  // Tokens: each call's growth, less what the model wrote, split among what entered before it.
  const shares = new Map();
  const add = (what, amount, reads) => {
    const entry = shares.get(what) ?? { carried: 0, tokens: 0 };
    entry.tokens += amount;
    entry.carried += amount * reads;
    shares.set(what, entry);
  };
  let unexplained = 0;
  // The baseline is sent again after every compaction, so every call carried it.
  add("the baseline: the system prompt, the tools, the loaded documents, the first message", context[0], count);
  const compacted = [];
  for (let index = 1; index < count; index++) {
    const growth = context[index] - context[index - 1];
    const output = calls[index - 1].usage.output_tokens ?? 0;
    const reads = carried(index);
    const boundary = compactedBefore.get(index);
    if (boundary) {
      compacted.push({ beforeCall: index + 1, from: context[index - 1], idle: boundary.idle, to: context[index], trigger: boundary.trigger });
      add("a compaction's summary and what it kept", Math.max(0, context[index] - context[0]), reads);
      continue;
    }
    add("written by the model: thinking, text, tool calls", Math.min(output, Math.max(growth, 0)), reads);
    let added = growth - output;
    if (added < 0) {
      unexplained += added;
      added = 0;
    }
    const entered = blocks.filter((block) => block.at === index && !block.written && !NOT_CONTEXT.has(block.category));
    const chars = entered.reduce((sum, block) => sum + block.chars, 0);
    if (chars === 0) {
      add("not attributed", added, reads);
      continue;
    }
    for (const block of entered) add(groupOf(block), (added * block.chars) / chars, reads);
  }
  const carriedSum = [...shares.values()].reduce((sum, entry) => sum + entry.carried, 0);
  const groups = [...shares.entries()]
    .map(([what, entry]) => ({ share: entry.carried / carriedSum, tokens: Math.round(entry.tokens), what }))
    .sort((a, b) => b.share - a.share);

  // Characters: every block by its size times the calls that carried it, for the names behind the groups.
  const weight = (block) => (block.dropped || NOT_CONTEXT.has(block.category) ? 0 : block.chars * carried(block.at));
  const weightSum = blocks.reduce((sum, block) => sum + weight(block), 0) || 1;
  const keyed = new Map();
  const areas = new Map();
  for (const block of blocks) {
    if (block.key !== "" && !block.category.startsWith("attachment")) {
      const name = `${block.written ? "call  " : "result"} ${block.key}`;
      const entry = keyed.get(name) ?? { chars: 0, count: 0, weight: 0 };
      entry.chars += block.chars;
      entry.count += 1;
      entry.weight += weight(block);
      keyed.set(name, entry);
    }
    if (block.category === "result Read") {
      const area = areaOf(block.key);
      const entry = areas.get(area) ?? { chars: 0, files: new Set(), reads: 0, weight: 0 };
      entry.chars += block.chars;
      entry.reads += 1;
      entry.weight += weight(block);
      entry.files.add(block.key);
      areas.set(area, entry);
    }
  }
  const keys = [...keyed.entries()].map(([name, entry]) => ({ chars: entry.chars, count: entry.count, name, share: entry.weight / weightSum })).sort((a, b) => b.share - a.share);
  const reads = [...areas.entries()].map(([area, entry]) => ({ area, chars: entry.chars, files: entry.files.size, reads: entry.reads, share: entry.weight / weightSum })).sort((a, b) => b.share - a.share);
  const largest = blocks
    .filter((block) => !NOT_CONTEXT.has(block.category))
    .sort((a, b) => b.chars - a.chars).slice(0, 10).map((block) => ({ atCall: block.at + 1, category: block.category, chars: block.chars, key: block.key }));

  const writes = [];
  for (let index = 0; index < count; index++) {
    const wrote = calls[index].usage.cache_creation_input_tokens ?? 0;
    if (wrote < LARGE_WRITE) continue;
    const pause = index === 0 ? 0 : Math.round((Date.parse(calls[index].time) - Date.parse(calls[index - 1].time)) / 60_000);
    writes.push({ call: index + 1, pauseMinutes: pause, share: (wrote * PRICE.cacheWrite) / weighedSum, tokens: wrote });
  }

  const baselineChars = baseline.reduce((sum, part) => sum + part.chars, 0) || 1;
  const parts = [...baseline].sort((a, b) => b.chars - a.chars).map((part) => ({ ...part, share: part.chars / baselineChars }));

  return {
    baseline: { chars: baseline.reduce((sum, part) => sum + part.chars, 0), parts, tokens: context[0] },
    calls: count,
    compactions: compacted,
    context: { first: context[0], last: context[count - 1], max: Math.max(...context), tenths },
    cost,
    first: calls[0].time,
    groups,
    images,
    keys,
    largest,
    last: calls[count - 1].time,
    models,
    reads,
    title,
    tokens,
    unexplained,
    writes,
  };
}

const number = (value) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const percent = (share, digits = 0) => `${(100 * share).toFixed(digits)}%`;
const right = (value, width) => String(value).padStart(width);

/** The profile as text, most of the cost first. */
export function renderProfile(profile, { top = 25 } = {}) {
  const lines = [];
  const say = (line = "") => lines.push(line);
  say(`session: ${profile.title || "(no title)"}`);
  say(`calls ${profile.calls}, ${String(profile.first).slice(0, 16)} to ${String(profile.last).slice(0, 16)}; images ${profile.images}`);
  say();
  say("tokens, summed over every call");
  for (const [model, entry] of Object.entries(profile.models)) {
    say(`  ${model}: calls ${entry.calls}, read from cache ${number(entry.cacheRead)}, written to cache ${number(entry.cacheWrite)}, fresh input ${number(entry.fresh)}, output ${number(entry.output)}`);
  }
  say(`  at the API's price ratios (cache read ${PRICE.cacheRead}, cache write ${PRICE.cacheWrite}, output ${PRICE.output}): re-reading ${percent(profile.cost.cacheRead)}, cache writes ${percent(profile.cost.cacheWrite)}, output ${percent(profile.cost.output)}`);
  say();
  say(`context: first call ${number(profile.context.first)}, last ${number(profile.context.last)}, largest ${number(profile.context.max)}`);
  for (const tenth of profile.context.tenths) {
    say(`  calls ${right(tenth.from, 4)} to ${right(tenth.to, 4)}: average ${right(number(tenth.average), 9)}, ${right(percent(tenth.share), 4)} of all tokens read`);
  }
  say();
  say(profile.compactions.length === 0 ? "compactions: none" : "compactions");
  for (const entry of profile.compactions) {
    say(`  before call ${entry.beforeCall}: ${number(entry.from)} to ${number(entry.to)}, ${entry.idle ? "from a summary written while the session was idle" : `in the session (${entry.trigger})`}`);
  }
  say();
  say(profile.writes.length === 0 ? `calls that wrote ${number(LARGE_WRITE)} tokens or more to the cache: none` : `calls that wrote ${number(LARGE_WRITE)} tokens or more to the cache`);
  for (const write of profile.writes) {
    say(`  call ${right(write.call, 4)}: ${right(number(write.tokens), 9)} after a pause of ${write.pauseMinutes} minutes, ${percent(write.share)} of the session at those ratios`);
  }
  say();
  say("what the session re-read, by share of every token read (an estimate: growth is split by characters)");
  for (const group of profile.groups) say(`  ${right(percent(group.share, 1), 6)} ${right(number(group.tokens), 9)} tokens  ${group.what}`);
  if (profile.unexplained < 0) say(`  the context shrank by ${number(-profile.unexplained)} tokens between calls with no compaction recorded`);
  say();
  say(`the baseline: ${number(profile.baseline.tokens)} tokens at the first call, ${number(profile.baseline.chars)} characters recorded; tokens below are the first call's, split by characters`);
  const about = (share) => `about ${right(number(share * profile.baseline.tokens), 7)} tokens`;
  const kinds = new Map();
  for (const part of profile.baseline.parts) kinds.set(part.what, (kinds.get(part.what) ?? 0) + part.share);
  for (const [what, share] of [...kinds.entries()].sort((a, b) => b[1] - a[1])) say(`  ${right(percent(share), 4)} ${about(share)}  ${what}`);
  say("  the largest parts");
  for (const part of profile.baseline.parts.slice(0, Math.min(top, 15))) say(`  ${right(percent(part.share, 1), 6)} ${about(part.share)}  ${part.what}${part.name === "" ? "" : `: ${part.name}`}`);
  say();
  say(`the ${top} costliest tool calls and results, by characters times the calls that carried them`);
  for (const key of profile.keys.slice(0, top)) say(`  ${right(percent(key.share, 1), 6)} ${right(number(key.chars), 10)} chars in ${right(key.count, 4)}  ${key.name}`);
  say();
  say("files read with Read, by area");
  for (const area of profile.reads) say(`  ${right(percent(area.share, 1), 6)} ${right(number(area.chars), 10)} chars, ${area.reads} reads of ${area.files} files  ${area.area}`);
  say();
  say("the largest single blocks");
  for (const block of profile.largest) say(`  ${right(number(block.chars), 10)} chars at call ${right(block.atCall, 4)}  ${block.category}${block.key === "" ? "" : `  ${block.key}`}`);
  return `${lines.join("\n")}\n`;
}

function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { top: { default: "25", type: "string" } } });
  const [path] = positionals;
  if (path === undefined) {
    console.error("usage: node scripts/session-profile.mjs <transcript.jsonl> [--top 25]");
    process.exitCode = 2;
    return;
  }
  process.stdout.write(renderProfile(buildProfile(readTranscript(readFileSync(path, "utf8"))), { top: Number(values.top) }));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
