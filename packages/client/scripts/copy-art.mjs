// Writes the art the client draws into generated/art beside this package,
// which angular.json serves at /art. Angular takes assets only from inside
// its workspace root (packages/client), and the art's one home is art/ at
// the repository root with its provenance, so the build writes it here
// rather than the repository keeping two. Run before every serve, build and
// test; generated/ is ignored.
//
// A sprite set, under art/heroes, art/monsters, art/props and art/weapons, is
// packed into one sheet, sheet.png and sheet.json (pack-art.mjs; Issue-205):
// its frames and its provenance are not published. art/effects,
// art/facilities, art/ground and art/icons are copied as they are, and beside
// the facilities' pictures goes bases.json, the row each one stands on
// (docs/process/assets.md, rule 18), measured here so that the page reads no
// pixels.
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { opaqueRows, PACKED_AREAS, packSet } from "./pack-art.mjs";

const from = fileURLToPath(new URL("../../../art/", import.meta.url));
const to = fileURLToPath(new URL("../generated/art/", import.meta.url));
const COPIED_AREAS = ["effects", "facilities", "ground", "icons"];

/** A picture's pixels as RGBA, whatever the PNG's own colour type. */
async function pixels(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { name: basename(file, ".png"), width: info.width, height: info.height, data };
}

const directories = (dir) => readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const pictures = (dir) => readdirSync(dir).filter((name) => name.endsWith(".png")).sort().map((name) => join(dir, name));

rmSync(to, { recursive: true, force: true });

let sheets = 0;
for (const [area, kind] of Object.entries(PACKED_AREAS)) {
  for (const name of directories(join(from, area))) {
    const dir = join(from, area, name);
    const frames = await Promise.all(pictures(dir).map(pixels));
    const provenance = JSON.parse(readFileSync(join(dir, "provenance.json"), "utf8"));
    const { image, json } = packSet({ set: `${area}/${name}`, kind, frames, provenance });
    const out = join(to, area, name);
    mkdirSync(out, { recursive: true });
    await sharp(image.data, { raw: { width: image.width, height: image.height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(join(out, "sheet.png"));
    writeFileSync(join(out, "sheet.json"), JSON.stringify(json));
    sheets++;
  }
}

for (const area of COPIED_AREAS) {
  cpSync(join(from, area), join(to, area), {
    recursive: true,
    filter: (source) => !/\.[a-z]+$/i.test(source) || /\.(png|json)$/i.test(source),
  });
}

const bases = {};
for (const kind of directories(join(from, "facilities"))) {
  for (const file of pictures(join(from, "facilities", kind))) bases[`${kind}/${basename(file, ".png")}`] = opaqueRows(await pixels(file)).bottom;
}
writeFileSync(join(to, "facilities", "bases.json"), JSON.stringify(bases));

console.log(`packed ${sheets} sprite sets from art/${Object.keys(PACKED_AREAS).join(", art/")} and copied art/${COPIED_AREAS.join(", art/")} into packages/client/generated/art`);
