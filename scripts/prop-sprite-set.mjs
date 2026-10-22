#!/usr/bin/env node
// Writes a prop's sprite set from PixelLab's export of an object, the
// standing frame and its animations, and its provenance (docs/process/assets.md,
// rules 30 and 31).
//
//   node scripts/prop-sprite-set.mjs --object <id> --out art/props/<set> --record <file> [--zip <file>]
//
// The export is downloaded from PixelLab (the object id is the only key it
// needs) unless --zip names a copy already on disk. Its animations are named
// by their descriptions, so the record names each one's folder. Every file
// written is the export's own bytes, checked by SHA-256. Prints a JSON report
// and exits 1 if a check fails.
//
// The record is the agent's note of what the export does not hold:
//   { "name": "Tree 01", "props": ["tree"], "createdAt": "...", "description": "...", "canvas": [48, 64],
//     "parameters": { ... }, "generations": 1,
//     "animations": { "hit": { "folder": "<export folder>", "groupId": "...", "description": "...",
//                              "frameCount": 6, "frames": 7, "generations": 1, "heldLast"?: true, "fadeToLast"?: true,
//                              "endFrame"?: { "objectId": "...", "stateName": "...", "editDescription": "...", "generations": 1 },
//                              "replaced"?: [{ "groupId": "...", "description": "...", "generations": 1, "why": "..." }] } },
//     "rejected"?: [{ "name": "...", "objectId": "...", "description": "..." }] }

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { inflateRawSync } from "node:zlib";

const { values } = parseArgs({
  options: { object: { type: "string" }, out: { type: "string" }, record: { type: "string" }, zip: { type: "string" } },
});
if (!values.object || !values.out || !values.record) {
  console.error("usage: prop-sprite-set.mjs --object <id> --out <dir> --record <file> [--zip file]");
  process.exit(2);
}
const record = JSON.parse(readFileSync(values.record, "utf8"));

// The same reader as scripts/hero-sprite-set.mjs: PixelLab's zips are stored or deflated, nothing else.
function unzip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad central directory");
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + compressed);
    const data = method === 0 ? raw : method === 8 ? inflateRawSync(raw) : null;
    if (!data || data.length !== size) throw new Error(`cannot read ${name}`);
    entries.set(name, data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}
const sha = (b) => createHash("sha256").update(b).digest("hex");
const size = (png) => [png.readUInt32BE(16), png.readUInt32BE(20)];

const zip = unzip(
  values.zip
    ? readFileSync(values.zip)
    : Buffer.from(await (await fetch(`https://api.pixellab.ai/mcp/objects/${values.object}/download`)).arrayBuffer()),
);
const failures = [];
const report = { object: values.object, files: 0, animations: {}, failures };
mkdirSync(values.out, { recursive: true });
const write = (file, from) => {
  const bytes = zip.get(from);
  if (!bytes) return failures.push(`the export has no ${from}`);
  writeFileSync(join(values.out, file), bytes);
  if (sha(readFileSync(join(values.out, file))) !== sha(bytes)) failures.push(`${file} differs from ${from}`);
  if (size(bytes).join() !== record.canvas.join()) failures.push(`${file} is ${size(bytes).join("x")}, not ${record.canvas.join("x")}`);
  report.files++;
};

write("standing.png", "rotations/unknown.png");
for (const [name, a] of Object.entries(record.animations)) {
  const frames = [...zip.keys()].filter((k) => k.startsWith(`animations/${a.folder}/unknown/`)).sort();
  report.animations[name] = frames.length;
  if (frames.length !== a.frames) failures.push(`${name}: ${frames.length} frames, expected ${a.frames}`);
  frames.forEach((from, i) => write(`${name}-${i}.png`, from));
}

// The plan and terms, as in scripts/hero-sprite-set.mjs (decision 0025).
const SERVICE = {
  name: "PixelLab",
  plan: "Tier 1: Pixel Apprentice",
  terms: "https://www.pixellab.ai/termsofservice",
  termsLastUpdated: "2025-11-23",
  rights: "Owned by the creator; commercial use for any purpose except training other models (terms 1.2, 3.3). No indemnity.",
};
const set = values.out.split(/[\\/]/).filter(Boolean).pop();
const animations = Object.fromEntries(
  Object.entries(record.animations).map(([name, a]) => [name, {
    tool: "animate_object",
    mode: "v3",
    via: "MCP",
    groupId: a.groupId,
    animationDescription: a.description,
    frameCount: a.frameCount,
    frames: a.frames,
    canvas: record.canvas,
    ...(a.endFrame ? { endFrame: a.endFrame } : {}),
    ...(a.heldLast ? { heldLast: true } : {}),
    ...(a.fadeToLast ? { fadeToLast: true } : {}),
    files: `${name}-<0..${a.frames - 1}>.png`,
    generations: a.generations,
    ...(a.replaced ? { replaced: a.replaced } : {}),
  }]),
);
const provenance = {
  set,
  kind: "prop sprite set",
  props: record.props,
  service: SERVICE,
  pixellab: { objectId: values.object, name: record.name, tags: ["heat", "prop", ...record.props] },
  object: {
    tool: "create_map_object",
    via: "MCP",
    createdAt: record.createdAt,
    parameters: { description: record.description, ...record.parameters },
    canvas: record.canvas,
    generations: record.generations,
  },
  files: { standing: { file: "standing.png", canvas: record.canvas, from: "the object's one rotation" } },
  animations,
  // Everything the animations cost, the end states and the replaced takes too.
  animationGenerations: Object.values(animations).reduce(
    (n, a) => n + a.generations + (a.endFrame?.generations ?? 0) + (a.replaced ?? []).reduce((m, r) => m + r.generations, 0),
    0,
  ),
  ...(record.rejected ? { rejected: record.rejected } : {}),
  verified: `Every PNG here is byte-identical to the same file in PixelLab's own export of the object, downloaded ${new Date().toISOString().slice(0, 10)}.`,
};
const json = JSON.stringify(provenance, null, 2).replace(/\[\s+([^[\]{}]*?)\s+\]/g, (_, items) => `[${items.split(/,\s+/).join(", ")}]`);
writeFileSync(join(values.out, "provenance.json"), json + "\n");

console.log(JSON.stringify(report, null, 2));
process.exit(failures.length ? 1 : 0);
