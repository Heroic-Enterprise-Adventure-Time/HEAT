#!/usr/bin/env node
// Two steps of making an icon under art/icons, a resource's or a facility's
// (docs/process/assets.md, rules 25 to 27; docs/runbooks/resource-icon.md):
//
//   node scripts/icon-set.mjs sheet --frames "<url with {i}>" --indices 1-5,7-63 --out <file.png> [--scale 3]
//   node scripts/icon-set.mjs keep --object <id> --name <name> --pack <pack> --candidate <n> [--frames "<url with {i}>"]
//
// `sheet` draws the numbered sheet the owner picks from: every candidate of
// a pack's review object, side by side at a whole-number scale on the battle
// scene's green, each under its index as rolled. `--frames` is the address
// PixelLab's get_object prints for the review object's frames, with `{i}`
// where the index goes; it carries the account's id, so it is passed and
// never committed.
//
// `keep` writes a promoted pick as art/icons/<name>.png, the service's own
// bytes from /mcp/objects/<id>/download, and its entry in
// art/icons/provenance.json under the pack it was picked from. With
// `--frames` the file is also compared with its candidate frame in the
// review object, which is only possible before the pick is promoted out of
// it or from a copy kept from then; without it that check is reported as not
// made. Run again for an icon already kept, it checks the committed file
// against the service and changes nothing. What is true of the pack, who
// chose and how the files were verified, is written into the pack's entry by
// hand. Prints a JSON report and exits 1 if a check fails.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import sharp from "sharp";

import { colourToken } from "../packages/client/scripts/style-tokens.mjs";
import { GROUNDS } from "../packages/client/src/app/ground-sets.ts";

const art = (path) => fileURLToPath(new URL(`../art/${path}`, import.meta.url));
/** An icon's canvas (rule 25). */
const ICON = 32;
/**
 * The scenes' ground, which a drop's icon is read against: the colour the
 * meadow's canvas is made with, read from the page's own list of ground sets
 * and never copied here (typescript.md, rule 29). It is no token of the
 * stylesheet.
 */
const GROUND = [1, 3, 5].map((at) => Number.parseInt(GROUNDS["meadow-01"].backdrop.slice(at, at + 2), 16)).concat(255);
/** The scene glyph and its outline, for the numbers and the sheet behind them, from the stylesheet's roles (assets.md, rule 39). */
const GLYPH = colourToken("--scene-glyph");
const OUTLINE = colourToken("--scene-glyph-outline");
const COLUMNS = 9;
const GAP = 4;
/** The numbers are the scene's own font, twice its size (rule 37). */
const FONT = "fonts/scene-01";
const LABEL_SCALE = 2;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    frames: { type: "string" },
    indices: { type: "string" },
    out: { type: "string" },
    scale: { type: "string", default: "3" },
    object: { type: "string" },
    name: { type: "string" },
    pack: { type: "string" },
    candidate: { type: "string" },
  },
});

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${new URL(url).pathname} answered ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function pixels(bytes) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

/** "1-5,7,9-12" as its numbers, in order. */
function indicesOf(text) {
  const indices = [];
  for (const part of text.split(",")) {
    const [from, to = from] = part.split("-").map(Number);
    if (!Number.isInteger(from) || !Number.isInteger(to) || to < from) throw new Error(`--indices: ${part} is not a number or a range`);
    for (let index = from; index <= to; index++) indices.push(index);
  }
  return indices;
}

/** Copies `source` onto `sheet` at `scale`, a square of device pixels for each of its pixels, its transparent pixels left as the sheet has them; in `colour` where one is given. */
function draw(sheet, source, box, left, top, scale, colour) {
  for (let y = 0; y < box.height * scale; y++) {
    for (let x = 0; x < box.width * scale; x++) {
      const from = ((box.y + Math.floor(y / scale)) * source.width + box.x + Math.floor(x / scale)) * 4;
      if (source.data[from + 3] === 0) continue;
      const to = ((top + y) * sheet.width + left + x) * 4;
      if (colour) sheet.data.set(colour, to);
      else source.data.copy(sheet.data, to, from, from + 4);
    }
  }
}

async function sheet() {
  if (!values.frames?.includes("{i}") || !values.indices || !values.out) throw new Error('usage: icon-set.mjs sheet --frames "<url with {i}>" --indices 1-63 --out <file.png> [--scale 3]');
  const scale = Number(values.scale);
  const indices = indicesOf(values.indices);
  const font = JSON.parse(readFileSync(art(`${FONT}/provenance.json`), "utf8")).atlas;
  const atlas = await pixels(readFileSync(art(`${FONT}/${font.file}`)));
  const cell = ICON * scale;
  const label = font.glyphPx * LABEL_SCALE + GAP;
  const rows = Math.ceil(indices.length / COLUMNS);
  const image = { width: COLUMNS * (cell + GAP) + GAP, height: rows * (label + cell + GAP) + GAP };
  image.data = Buffer.alloc(image.width * image.height * 4);
  for (let at = 0; at < image.data.length; at += 4) image.data.set(OUTLINE, at);
  for (const [n, index] of indices.entries()) {
    const left = GAP + (n % COLUMNS) * (cell + GAP);
    const top = GAP + Math.floor(n / COLUMNS) * (label + cell + GAP);
    for (const [place, digit] of [...String(index)].entries()) {
      const glyph = font.characters.indexOf(digit);
      const box = { x: (glyph % font.columns) * font.glyphPx, y: Math.floor(glyph / font.columns) * font.glyphPx, width: font.glyphPx, height: font.glyphPx };
      draw(image, atlas, box, left + place * font.glyphPx * LABEL_SCALE, top, LABEL_SCALE, GLYPH);
    }
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) image.data.set(GROUND, ((top + label + y) * image.width + left + x) * 4);
    const frame = await pixels(await download(values.frames.replace("{i}", String(index))));
    if (frame.width !== ICON || frame.height !== ICON) throw new Error(`candidate ${index} is ${frame.width} by ${frame.height}, not ${ICON} by ${ICON}`);
    draw(image, frame, { x: 0, y: 0, width: ICON, height: ICON }, left, top + label, scale, null);
  }
  await sharp(image.data, { raw: { width: image.width, height: image.height, channels: 4 } }).png().toFile(values.out);
  return { sheet: values.out, candidates: indices.length, scale, size: [image.width, image.height], failures: [] };
}

async function keep() {
  const { object, name, pack } = values;
  const candidate = Number(values.candidate);
  if (!object || !name || !pack || !Number.isInteger(candidate)) throw new Error('usage: icon-set.mjs keep --object <id> --name <name> --pack <pack> --candidate <n> [--frames "<url with {i}>"]');
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`--name: ${name} is not a file's name`);
  const failures = [];
  const provenanceFile = art("icons/provenance.json");
  const provenance = JSON.parse(readFileSync(provenanceFile, "utf8"));
  if (typeof provenance[pack]?.reviewObjectId !== "string") throw new Error(`art/icons/provenance.json has no pack ${pack}`);

  const bytes = await download(`https://api.pixellab.ai/mcp/objects/${object}/download`);
  const { width, height } = await pixels(bytes);
  if (width !== ICON || height !== ICON) failures.push(`the download is ${width} by ${height}, not ${ICON} by ${ICON}`);
  let matchesCandidate = "not checked: no --frames";
  if (values.frames) {
    const frame = await download(values.frames.replace("{i}", String(candidate)));
    matchesCandidate = sha256(frame) === sha256(bytes);
    if (!matchesCandidate) failures.push(`the download is not candidate ${candidate}'s frame`);
  }

  const file = art(`icons/${name}.png`);
  const entry = { file: `${name}.png`, canvas: [ICON, ICON], pack, candidate, pixellab: { objectId: object, tags: ["heat", "ui-icon", name] } };
  const kept = provenance.icons[name];
  let wrote = false;
  if (existsSync(file) || kept) {
    // Already kept: the committed file and its entry are checked, and nothing is written.
    if (!existsSync(file) || sha256(readFileSync(file)) !== sha256(bytes)) failures.push(`art/icons/${name}.png is not the service's download of ${object}`);
    if (JSON.stringify(kept) !== JSON.stringify(entry)) failures.push(`the entry of ${name} in art/icons/provenance.json is not this pick`);
  } else if (failures.length === 0) {
    writeFileSync(file, bytes);
    provenance.icons[name] = entry;
    writeFileSync(provenanceFile, `${JSON.stringify(provenance, null, 2)}\n`);
    wrote = true;
  }
  return { icon: `art/icons/${name}.png`, sha256: sha256(bytes), wrote, matchesCandidate, failures };
}

const steps = { sheet, keep };
const step = steps[positionals[0]];
if (!step) {
  console.error("usage: icon-set.mjs sheet|keep ... (see the head of this file)");
  process.exit(2);
}
const report = await step();
console.log(JSON.stringify(report, null, 2));
if (report.failures.length > 0) process.exit(1);
