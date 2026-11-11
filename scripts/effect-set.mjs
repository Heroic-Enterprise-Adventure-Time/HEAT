#!/usr/bin/env node
// Writes an action effect from PixelLab's game pack of a vfx_workbench effect,
// its sheet and manifest, and its provenance (docs/process/assets.md, rules 32
// to 35).
//
//   node scripts/effect-set.mjs --out art/effects/<set> --record <file> [--zip <file>]
//
// The game pack is downloaded from the export's link (the record's `imageId`
// and `file`) unless --zip names a copy already on disk. Of its pieces only
// the whole effect without the sprite is kept: `whole.png` and the
// `manifest.json` that says where it stands. Every file written is the
// pack's own bytes, checked by SHA-256. Prints a JSON report and exits 1 if a
// check fails.
//
// The record is the agent's note of what the pack does not hold:
//   { "name": "HEAT slash 01", "abilities": ["strike"], "effectId": "...", "imageId": "...",
//     "file": "heat-slash-01-game.zip", "createdAt": "...", "madeAround": "...",
//     "parts": [{ "name": "slash_trail", "size": 0.7, "colour": [...], ... }], "edits": ["..."] }
// A projectile's pack (rule 35) also holds clips with a role, the projectile and its impact; their sheets are
// written beside whole.png. "madeFor" says what a set is for while its "abilities" are still empty, before the
// engine has the ability.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { inflateRawSync } from "node:zlib";

const { values } = parseArgs({ options: { out: { type: "string" }, record: { type: "string" }, zip: { type: "string" } } });
if (!values.out || !values.record) {
  console.error("usage: effect-set.mjs --out <dir> --record <file> [--zip file]");
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

const zip = unzip(
  values.zip
    ? readFileSync(values.zip)
    : Buffer.from(await (await fetch(`https://api.pixellab.ai/mcp/pixel-tools/${record.imageId}/${record.file}`)).arrayBuffer()),
);
const failures = [];
mkdirSync(values.out, { recursive: true });
for (const file of ["whole.png", "manifest.json"]) {
  const bytes = zip.get(file);
  if (!bytes) {
    failures.push(`the pack has no ${file}`);
    continue;
  }
  writeFileSync(join(values.out, file), bytes);
  if (sha(readFileSync(join(values.out, file))) !== sha(bytes)) failures.push(`${file} differs from the pack's`);
}
const manifest = JSON.parse(zip.get("manifest.json")?.toString("utf8") ?? "{}");
// A projectile's pieces (rule 35): the clips the manifest gives a role, the projectile in place and its impact,
// each a sheet of its own for the game to move and to play on resolve.
const roleFiles = {};
for (const clip of manifest.clips?.filter((c) => c.role) ?? []) {
  for (const { file } of clip.sheets) {
    const bytes = zip.get(file);
    if (!bytes) {
      failures.push(`the pack has no ${file}`);
      continue;
    }
    writeFileSync(join(values.out, file), bytes);
    if (sha(readFileSync(join(values.out, file))) !== sha(bytes)) failures.push(`${file} differs from the pack's`);
    roleFiles[file] = `the game pack's ${clip.role} clip, ${clip.frames} frames`;
  }
}
const whole = manifest.clips?.find((c) => c.name === "whole");
if (!whole) failures.push("the manifest has no whole clip");
if (manifest.loop) failures.push("the effect loops; an action's effect plays once");
if (manifest.anchor?.kind !== "feet") failures.push(`the anchor is the ${manifest.anchor?.kind}, not the target's feet`);

// The plan and terms, as in scripts/hero-sprite-set.mjs (decision 0025).
const SERVICE = {
  name: "PixelLab",
  plan: "Tier 1: Pixel Apprentice",
  terms: "https://www.pixellab.ai/termsofservice",
  termsLastUpdated: "2025-11-23",
  rights: "Owned by the creator; commercial use for any purpose except training other models (terms 1.2, 3.3). No indemnity.",
};
const set = values.out.split(/[\\/]/).filter(Boolean).pop();
const provenance = {
  set,
  kind: "action effect",
  abilities: record.abilities,
  ...(record.madeFor ? { madeFor: record.madeFor } : {}),
  service: SERVICE,
  pixellab: { effectId: record.effectId, name: record.name, imageId: record.imageId },
  effect: {
    tool: "vfx_workbench",
    via: "MCP",
    createdAt: record.createdAt,
    madeAround: record.madeAround,
    parts: record.parts,
    ...(record.edits ? { edits: record.edits } : {}),
    export: ["export", "--name", record.name, "--game-pack"],
    generations: 0,
  },
  files: {
    "whole.png": "the game pack's whole clip: the effect without the sprite, a sheet of frames",
    "manifest.json": "the game pack's manifest: the frame size, the sheet's layout, the fps and the offset from the target's feet",
    ...roleFiles,
  },
  frames: whole?.frames,
  fps: manifest.fps,
  verified: `${["whole.png", ...Object.keys(roleFiles)].join(", ")} and manifest.json are byte-identical to the same files in PixelLab's game pack of the effect, downloaded ${new Date().toISOString().slice(0, 10)}.`,
};
const json = JSON.stringify(provenance, null, 2).replace(/\[\s+([^[\]{}]*?)\s+\]/g, (_, items) => `[${items.split(/,\s+/).join(", ")}]`);
writeFileSync(join(values.out, "provenance.json"), json + "\n");

console.log(JSON.stringify({ set, frames: whole?.frames, fps: manifest.fps, failures }, null, 2));
process.exit(failures.length ? 1 : 0);
