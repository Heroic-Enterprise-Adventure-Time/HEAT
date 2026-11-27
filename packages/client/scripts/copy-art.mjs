// Writes the art the client draws into generated/art beside this package,
// which angular.json serves at /art. Angular takes assets only from inside
// its workspace root (packages/client), and the art's one home is art/ at
// the repository root with its provenance, so the build writes it here
// rather than the repository keeping two. Run before every serve, build and
// test; generated/ is ignored.
//
// A sprite set, under art/heroes, art/monsters, art/props and art/weapons, is
// packed into one sheet, its image named for its pixels and sheet.json naming
// it (pack-art.mjs; Issue-205): its frames and its provenance are not
// published. A font under art/fonts is packed the same way, its frames the
// glyphs a scene draws, cut from its atlas and given the scene glyph and its
// outline from src/styles.css (Issue-344, decision 0061). art/effects and art/ground are copied
// as they are.
// An icon is copied under a name that carries a hash of its file, and beside
// the icons goes pictures.json, that name for each icon: everything under
// /art is published to be kept for a year, so an icon made again has to be a
// new name, and the page and the battle scene read the name from the index
// (src/app/icon-names.ts; the review of PR-348). The favicon is the page's
// own file at its root, published to be read again within a minute, so it
// keeps its name and goes to generated/favicon, which angular.json serves.
// A facility's pictures are copied under names that carry a hash of the
// file, and beside them goes pictures.json: for each picture, that name and the
// row it stands on (docs/process/assets.md, rule 18), measured here so that
// the page reads no pixels. The page reads the picture's name there, so the
// row is always the row of the picture it is drawn with, whatever a browser
// has kept (the review of PR-334).
// A hero's portrait is cut from its set's still facing south, a square of
// head and shoulders (PORTRAIT in src/app/sprite-sets.ts), and copied under
// a name that carries a hash of the cut, with pictures.json beside the
// portraits naming each by its set, as the icons are.
// A frame under art/frames is trimmed to the box its pixels fill and copied
// under a name that carries a hash of the trimmed picture, and its name and
// its slice, from the frames' provenance, go into generated/frames.css, a
// stylesheet the page is built with (frame-art.mjs; docs/process/assets.md,
// rule 40).
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { GROUND_FILES, GROUNDS } from "../src/app/ground-sets.ts";
import { FRAMES, PACKED_AREAS, PORTRAIT, SET_CLIPS } from "../src/app/sprite-sets.ts";
import { checkFrameNames, checkSlice, frameStyles, opaqueBox, portraitStyle } from "./frame-art.mjs";
import { glyphFrames, opaqueRows, packSet, pictureName, portraitBox } from "./pack-art.mjs";
import { colourToken } from "./style-tokens.mjs";

const from = fileURLToPath(new URL("../../../art/", import.meta.url));
const to = fileURLToPath(new URL("../generated/art/", import.meta.url));
const favicon = fileURLToPath(new URL("../generated/favicon/", import.meta.url));
const COPIED_AREAS = ["effects", "ground"];
/** The icon that is the page's favicon, and no icon of the page's index. */
const FAVICON = "favicon";

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
    const provenance = JSON.parse(readFileSync(join(dir, "provenance.json"), "utf8"));
    // A font's frames are its glyphs, cut from its atlas; any other set's are its pictures.
    const frames = kind === "font"
      ? glyphFrames({ set: `${area}/${name}`, atlas: await pixels(join(dir, "atlas.png")), layout: provenance.atlas, glyphs: SET_CLIPS.font, ink: colourToken("--scene-glyph"), outline: colourToken("--scene-glyph-outline") })
      : await Promise.all(pictures(dir).map(pixels));
    const { image, json } = packSet({ set: `${area}/${name}`, kind, frames, provenance });
    const out = join(to, area, name);
    mkdirSync(out, { recursive: true });
    await sharp(image.data, { raw: { width: image.width, height: image.height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(join(out, image.name));
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

// Every ground set the page asks for was copied whole (typescript.md, rule 23): the list is the page's own,
// src/app/ground-sets.ts, so a set named there with no art under art/ground fails here and not in a scene.
for (const set of Object.keys(GROUNDS)) {
  const dir = join(to, "ground", set);
  const copied = new Set(existsSync(dir) ? readdirSync(dir) : []);
  const missing = GROUND_FILES.filter((file) => !copied.has(file));
  if (missing.length > 0) throw new Error(`art/ground/${set} lacks ${missing.join(" and ")}, which the page asks the ground set ${set} for (src/app/ground-sets.ts)`);
}

const facilityPictures = {};
for (const kind of directories(join(from, "facilities"))) {
  mkdirSync(join(to, "facilities", kind), { recursive: true });
  for (const file of pictures(join(from, "facilities", kind))) {
    const name = basename(file, ".png");
    const image = pictureName(name, readFileSync(file));
    cpSync(file, join(to, "facilities", kind, image));
    facilityPictures[`${kind}/${name}`] = { image, base: opaqueRows(await pixels(file)).bottom };
  }
}
writeFileSync(join(to, "facilities", "pictures.json"), JSON.stringify(facilityPictures));

const iconNames = {};
mkdirSync(join(to, "icons"), { recursive: true });
rmSync(favicon, { recursive: true, force: true });
mkdirSync(favicon, { recursive: true });
for (const file of pictures(join(from, "icons"))) {
  const name = basename(file, ".png");
  if (name === FAVICON) {
    cpSync(file, join(favicon, "favicon.png"));
    continue;
  }
  const image = pictureName(name, readFileSync(file));
  cpSync(file, join(to, "icons", image));
  iconNames[name] = image;
}
writeFileSync(join(to, "icons", "pictures.json"), JSON.stringify(iconNames));

const portraitNames = {};
mkdirSync(join(to, "portraits"), { recursive: true });
for (const set of directories(join(from, "heroes"))) {
  const source = join(from, "heroes", set, `${PORTRAIT.clip}.png`);
  const box = portraitBox(await pixels(source), PORTRAIT.side, `art/heroes/${set}/${PORTRAIT.clip}.png`);
  const cut = await sharp(source).extract(box).png({ compressionLevel: 9 }).toBuffer();
  const image = pictureName(set, cut);
  writeFileSync(join(to, "portraits", image), cut);
  portraitNames[set] = image;
}
writeFileSync(join(to, "portraits", "pictures.json"), JSON.stringify(portraitNames));

const frameProvenance = JSON.parse(readFileSync(join(from, "frames", "provenance.json"), "utf8"));
checkFrameNames(Object.keys(frameProvenance.frames), FRAMES);
const framePictures = new Set(pictures(join(from, "frames")).map((file) => basename(file)));
const frames = {};
mkdirSync(join(to, "frames"), { recursive: true });
for (const [name, { file, slice }] of Object.entries(frameProvenance.frames)) {
  if (!framePictures.delete(file)) throw new Error(`art/frames/provenance.json names ${file} for the frame ${name}, and there is no such picture`);
  const source = join(from, "frames", file);
  const box = opaqueBox(await pixels(source), name);
  checkSlice(name, slice, box);
  const trimmed = await sharp(source).extract(box).png({ compressionLevel: 9 }).toBuffer();
  const image = pictureName(name, trimmed);
  writeFileSync(join(to, "frames", image), trimmed);
  frames[name] = { image, slice };
}
if (framePictures.size > 0) throw new Error(`art/frames holds ${[...framePictures].join(" and ")}, which its provenance names for no frame`);
writeFileSync(fileURLToPath(new URL("../generated/frames.css", import.meta.url)), frameStyles(frames) + portraitStyle(PORTRAIT));

console.log(`packed ${sheets} sprite sets from art/${Object.keys(PACKED_AREAS).join(", art/")}, copied art/${[...COPIED_AREAS, "facilities", "icons"].join(", art/")}, cut ${Object.keys(portraitNames).length} portraits from art/heroes and trimmed ${Object.keys(frames).length} frames from art/frames into packages/client/generated`);
