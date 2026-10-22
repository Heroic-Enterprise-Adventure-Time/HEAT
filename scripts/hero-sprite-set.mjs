#!/usr/bin/env node
// Writes a hero or monster sprite set from PixelLab's export of a character, and
// runs the checks of docs/process/assets.md, rules 13 and 29, that a script can run.
//
//   node scripts/hero-sprite-set.mjs --character <id> --out art/heroes/<set>
//        [--record <file>] [--source <heat name>=<PixelLab animation name> ...] [--mirror-west] [--zip <file>]
//
// The export is downloaded from PixelLab (the character id is the only key it
// needs) unless --zip names a copy already on disk. Every file written is the
// export's own bytes, except a mirrored west still (--mirror-west), which is
// the east still flipped. Prints a JSON report and exits 1 if a check fails;
// what it lists under "review" is for the agent and the owner to look at.
//
// With --record, it also writes provenance.json (docs/process/assets.md, rule 5)
// from the agent's record of the generation calls, which the export lacks:
//   { "name": "Fighter 02", "classes": ["fighter"], "presentation": "masculine", "characterGenerations": 1,
//     "characterNote"?: "...", "handEdits"?: ["..."],
//     "waivers"?: [{ "check": "hit east: height drifts", "date": "...", "note": "..." }],
//     "animations": { "walk": { "groupId": "...", "source"?: "<PixelLab name>",
//                               "calls": [{ "directions": ["south"], "generations": 3, "date"?: "...", "note"?: "..." }] } } }
// A monster's record says "kind": "monster" and lists "monsters" in place of "classes" and "presentation", and
// may give "characterParameters" that differ from rule 8 (a quadruped's body_type and template). Each of its
// animations may name its own "template" and "mode", or "mode": "v3" with its "actionDescription", and its
// "frames" and, for act, its "holdFrame", where they differ from rule 11's (rule 28). Either kind may list the
// candidates not kept, as "rejected": [{ "name": "...", "characterId": "...", "description": "..." }].

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { crc32, deflateSync, inflateRawSync, inflateSync } from "node:zlib";

// The set, from docs/process/assets.md, rule 11.
const SET = {
  walk: { directions: ["south", "east", "north"], frames: 6 },
  stance: { directions: ["east"], frames: 8 },
  act: { directions: ["east"], frames: 3 },
  hit: { directions: ["east"], frames: 6 },
  down: { directions: ["east"], frames: 7, falls: true }, // the figure falls, so its height is meant to change
};
const STILLS = ["south", "east", "north", "west"];
const MAX_DRIFT = 2; // px of figure height across one animation, rule 13
const FAR = 48; // RGB distance from the nearest rotation colour beyond which a colour is a stray, not a shade

const { values } = parseArgs({
  options: {
    character: { type: "string" },
    out: { type: "string" },
    source: { type: "string", multiple: true, default: [] },
    "mirror-west": { type: "boolean", default: false },
    zip: { type: "string" },
    record: { type: "string" },
  },
});
if (!values.character || !values.out) {
  console.error("usage: hero-sprite-set.mjs --character <id> --out <dir> [--record file] [--source name=pixellabName ...] [--mirror-west] [--zip file]");
  process.exit(2);
}
const record = values.record ? JSON.parse(readFileSync(values.record, "utf8")) : null;
for (const [name, spec] of Object.entries(SET)) spec.frames = record?.animations?.[name]?.frames ?? spec.frames;
const sourceName = Object.fromEntries(Object.keys(SET).map((n) => [n, record?.animations?.[n]?.source ?? n]));
for (const pair of values.source) {
  const [name, source] = pair.split("=");
  if (!name || !source || !(name in SET)) throw new Error(`bad --source ${pair}`);
  sourceName[name] = source;
}

// --- zip -------------------------------------------------------------------

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

// --- PNG (8-bit RGBA, which is what PixelLab writes) -------------------------

function decodePng(buf) {
  let p = 8, width = 0, height = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    const body = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0) throw new Error("PNG is not 8-bit RGBA, non-interlaced");
    } else if (type === "IDAT") idat.push(body);
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4, out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? out[y * stride + x - 4] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? out[(y - 1) * stride + x - 4] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      if (pred === undefined) throw new Error(`PNG filter ${f}`);
      out[y * stride + x] = (line[x] + pred) & 0xff;
    }
  }
  return { width, height, data: out };
}

function encodePng({ width, height, data }) {
  const chunk = (type, body) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])) >>> 0, 0);
    return Buffer.concat([head, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) data.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function mirror(img) {
  const out = Buffer.alloc(img.data.length);
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      img.data.copy(out, (y * img.width + img.width - 1 - x) * 4, (y * img.width + x) * 4, (y * img.width + x) * 4 + 4);
  return { ...img, data: out };
}

const colours = (img) => {
  const s = new Set();
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3]) s.add(img.data.readUInt32BE(i));
  return s;
};
const height = (img) => {
  let top = -1, bottom = -1;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++)
      if (img.data[(y * img.width + x) * 4 + 3]) { if (top < 0) top = y; bottom = y; }
  return top < 0 ? 0 : bottom - top + 1;
};
// Opaque pixels outside the figure's largest 8-connected piece: fragments floating off the body.
const detached = (img) => {
  const seen = new Uint8Array(img.width * img.height), pieces = [];
  for (let start = 0; start < seen.length; start++) {
    if (seen[start] || !img.data[start * 4 + 3]) continue;
    const piece = [], stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop(), x = p % img.width, y = Math.floor(p / img.width);
      piece.push(p);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy, n = ny * img.width + nx;
          if (nx < 0 || ny < 0 || nx >= img.width || ny >= img.height || seen[n] || !img.data[n * 4 + 3]) continue;
          seen[n] = 1;
          stack.push(n);
        }
    }
    pieces.push(piece);
  }
  pieces.sort((a, b) => b.length - a.length);
  return pieces.slice(1).flat().map((p) => [p % img.width, Math.floor(p / img.width)]);
};
const hex = (n) => "#" + (n >>> 8).toString(16).padStart(6, "0") + ((n & 0xff) === 0xff ? "" : (n & 0xff).toString(16).padStart(2, "0"));
const sha = (b) => createHash("sha256").update(b).digest("hex");

// --- the set -----------------------------------------------------------------

const zipBytes = values.zip
  ? readFileSync(values.zip)
  : Buffer.from(await (await fetch(`https://api.pixellab.ai/mcp/characters/${values.character}/download`)).arrayBuffer());
const zip = unzip(zipBytes);
const meta = JSON.parse(zip.get("metadata.json").toString("utf8"));
const state = meta.states.find((s) => s.character.id === values.character);
if (!state) throw new Error(`the export has no state ${values.character}`);

const failures = [], review = [];
const report = {
  character: values.character,
  description: state.character.prompt,
  createdAt: state.character.created_at,
  exportVersion: meta.export_version,
  exportDate: meta.export_date,
  canvas: [state.character.size.width, state.character.size.height],
  files: 0,
  stills: {},
  animations: {},
  failures,
  review,
  waived: [],
};
mkdirSync(values.out, { recursive: true });
const write = (file, bytes, from) => {
  writeFileSync(join(values.out, file), bytes);
  if (from && sha(readFileSync(join(values.out, file))) !== sha(zip.get(from))) failures.push(`${file} differs from ${from}`);
  report.files++;
};

const rotations = {};
for (const d of STILLS) {
  const path = state.frames.rotations[d];
  if (!path) { failures.push(`no ${d} rotation`); continue; }
  rotations[d] = decodePng(zip.get(path));
  if (d === "west" && values["mirror-west"]) {
    const east = zip.get(state.frames.rotations.east);
    write("still-west.png", encodePng(mirror(decodePng(east))));
    report.stills.west = "the east rotation mirrored";
  } else {
    write(`still-${d}.png`, zip.get(path), path);
    report.stills[d] = path;
  }
}
const palette = new Set([...Object.values(rotations)].flatMap((r) => [...colours(r)]));
const rgb = (c) => [c >>> 24, (c >>> 16) & 0xff, (c >>> 8) & 0xff];
const nearest = (c) => {
  let best = { nearest: "", distance: Infinity };
  for (const q of palette) {
    const distance = Math.round(Math.hypot(...rgb(c).map((v, k) => v - rgb(q)[k])));
    if (distance < best.distance) best = { nearest: hex(q), distance };
  }
  return best;
};

for (const [name, spec] of Object.entries(SET)) {
  const source = state.frames.animations?.[sourceName[name]];
  const entry = (report.animations[name] = { source: sourceName[name], directions: {} });
  if (!source) { failures.push(`no animation named ${sourceName[name]} for ${name}`); continue; }
  for (const d of spec.directions) {
    const paths = source[d];
    if (!paths || paths.length !== spec.frames) {
      failures.push(`${name} ${d}: ${paths?.length ?? 0} frames, expected ${spec.frames}`);
      continue;
    }
    const heights = [], stray = {}, loose = [];
    paths.forEach((path, i) => {
      const img = decodePng(zip.get(path));
      write(`${name}-${d}-${i}.png`, zip.get(path), path);
      heights.push(height(img));
      for (const [x, y] of detached(img)) loose.push(`${i}:${x},${y}`);
      for (let p = 0; p < img.data.length; p += 4) {
        if (!img.data[p + 3]) continue;
        const c = img.data.readUInt32BE(p);
        if (palette.has(c)) continue;
        stray[hex(c)] ??= { ...nearest(c), at: [] };
        stray[hex(c)].at.push(`${i}:${(p / 4) % img.width},${Math.floor(p / 4 / img.width)}`);
      }
      entry.canvas = [img.width, img.height];
    });
    const drift = Math.max(...heights) - Math.min(...heights);
    const count = (list) => list.reduce((n, s) => n + s.at.length, 0);
    const strayPixels = count(Object.values(stray));
    const farPixels = count(Object.values(stray).filter((s) => s.distance > FAR));
    entry.directions[d] = { frames: paths.length, heights, drift, strayPixels, farPixels, stray, detached: loose };
    if (loose.length) review.push(`${name} ${d}: ${loose.length} px detached from the figure`);
    if (!spec.falls && drift > MAX_DRIFT) failures.push(`${name} ${d}: height drifts ${drift} px`);
    // A redrawn pose carries shades a step off the rotation's (Ranger 01's kept hit has 52 px of them), so only
    // colours far from every rotation colour are listed, and they are looked at, not refused.
    if (farPixels) review.push(`${name} ${d}: ${farPixels} px in colours far from any the character's rotations have`);
  }
}

// A failure the owner has looked at and accepted (rule 13) is recorded as waived, not failed.
for (const waiver of record?.waivers ?? []) {
  const i = failures.findIndex((f) => f.startsWith(waiver.check));
  if (i < 0) throw new Error(`the waiver "${waiver.check}" matches no failure`);
  report.waived.push({ failure: failures[i], ...waiver });
  failures.splice(i, 1);
}

// --- provenance ----------------------------------------------------------------

// The plan and terms the sets are made under, from decision 0025; change them here when the plan or the terms change.
const SERVICE = {
  name: "PixelLab",
  plan: "Tier 1: Pixel Apprentice",
  terms: "https://www.pixellab.ai/termsofservice",
  termsLastUpdated: "2025-11-23",
  rights: "Owned by the creator; commercial use for any purpose except training other models (terms 1.2, 3.3). No indemnity.",
};
// docs/process/assets.md, rule 8; the export records only the description, size, view and direction count.
const CHARACTER_PARAMETERS = {
  mode: "standard",
  n_directions: 4,
  size: 32,
  view: "low top-down",
  outline: "single color black outline",
  shading: "flat shading",
  detail: "low detail",
  proportions: "default",
};
const TEMPLATES = { walk: "walking", stance: "fight-stance-idle-8-frames", act: "lead-jab", hit: "taking-punch", down: "falling-back-death" };

if (record) {
  const set = values.out.split(/[\\/]/).filter(Boolean).pop();
  const monster = record.kind === "monster";
  const total = (calls) => calls.reduce((n, c) => n + c.generations, 0);
  const animations = Object.fromEntries(
    Object.entries(SET).map(([name, spec]) => {
      const r = record.animations[name];
      if (!r) throw new Error(`the record has no calls for ${name}`);
      return [name, {
        ...(r.mode === "v3" ? { actionDescription: r.actionDescription } : { template: r.template ?? TEMPLATES[name] }),
        mode: r.mode ?? "skeleton-v3",
        via: "MCP",
        groupId: r.groupId,
        ...(r.source && r.source !== name ? { pixellabName: r.source } : {}),
        directions: spec.directions,
        framesPerDirection: spec.frames,
        canvas: report.animations[name].canvas,
        ...(name === "act" ? { holdFrame: r.holdFrame ?? 1 } : {}),
        files: `${name}-${spec.directions.length > 1 ? "<direction>" : spec.directions[0]}-<0..${spec.frames - 1}>.png`,
        calls: r.calls,
        generations: total(r.calls),
      }];
    }),
  );
  const provenance = {
    set,
    kind: monster ? "monster sprite set" : "hero sprite set",
    ...(monster ? { monsters: record.monsters } : { classes: record.classes, presentation: record.presentation }),
    service: SERVICE,
    pixellab: { characterId: values.character, name: record.name, tags: ["heat", monster ? "monster" : "hero", ...(monster ? record.monsters : record.classes)] },
    character: {
      tool: "create_character",
      via: "MCP",
      createdAt: report.createdAt,
      parameters: { description: report.description, ...CHARACTER_PARAMETERS, ...record.characterParameters },
      canvas: report.canvas,
      generations: record.characterGenerations,
      ...(record.characterNote ? { note: record.characterNote } : {}),
    },
    ...(record.handEdits ? { handEdits: record.handEdits } : {}),
    files: {
      still: {
        frames: STILLS.map((d) => `still-${d}.png`),
        canvas: report.canvas,
        from: values["mirror-west"] ? "the character's rotations; still-west.png is the east rotation mirrored" : "the character's rotations",
      },
    },
    animations,
    animationGenerations: Object.values(animations).reduce((n, a) => n + a.generations, 0),
    ...(report.waived.length ? { waivedChecks: report.waived } : {}),
    ...(record.rejected ? { rejected: record.rejected } : {}),
    verified: values["mirror-west"]
      ? `Every PNG here except still-west.png is byte-identical to the same file in PixelLab's own export of the character (export version ${report.exportVersion}, ${report.exportDate.slice(0, 10)}).`
      : `Every PNG here is byte-identical to the same file in PixelLab's own export of the character (export version ${report.exportVersion}, ${report.exportDate.slice(0, 10)}).`,
  };
  // Arrays of plain values stay on one line, as in art/heroes/ranger-01/provenance.json.
  const json = JSON.stringify(provenance, null, 2).replace(/\[\s+([^[\]{}]*?)\s+\]/g, (_, items) => `[${items.split(/,\s+/).join(", ")}]`);
  writeFileSync(join(values.out, "provenance.json"), json + "\n");
}

console.log(JSON.stringify(report, null, 2));
process.exit(failures.length ? 1 : 0);
