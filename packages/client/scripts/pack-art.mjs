// Packs a sprite set's frames into one sheet for the scenes (decision 0028,
// Issue-205): the pixels in one image, and beside it PixiJS's atlas, the
// frames and the animations they make, with what a scene reads about the set
// under `set`: the row each picture stands on, measured here from its pixels,
// and how its provenance says it plays. The frames under art/ are the one
// source and are never changed; a sheet is written by the build and committed
// nowhere (docs/process/assets.md, rule 3).
//
// Everything here is a function of the frames it is handed, so that it is
// tested without a file; copy-art.mjs reads the files and writes the sheet.
//
// Which areas are packed, the kind of set each holds and the clips a scene
// asks a set of each kind for are the page's own list, src/app/sprite-sets.ts,
// which Node reads with its types stripped: a set without one of those clips
// fails the build here, not the page (docs/standards/typescript.md, rule 23).
import { createHash } from "node:crypto";

import { clamp, range, sortBy } from "es-toolkit";
import { MaxRectsPacker } from "maxrects-packer";

import { SET_CLIPS } from "../src/app/sprite-sets.ts";

/** No sheet is wider or taller than this, which every device's GPU takes; a set that outgrows it fails the build. */
const MAX_SIDE = 2048;
/** Transparent pixels between two frames, so that a frame drawn mirrored or split never samples its neighbour. */
const PADDING = 1;

/** The highest and lowest rows of a picture that hold a pixel that is not transparent; the top row for an empty one. */
export function opaqueRows({ width, height, data }) {
  const opaque = (y) => {
    for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 0) return true;
    return false;
  };
  let bottom = height - 1;
  while (bottom > 0 && !opaque(bottom)) bottom--;
  let top = 0;
  while (top < bottom && !opaque(top)) top++;
  return { top, bottom };
}

/**
 * Where a portrait is cut from a picture: a square `side` pixels across whose
 * top is the picture's top opaque row, moved up to stay inside the picture,
 * centred on the columns the square's rows fill and moved in to stay inside. A picture too small for the square,
 * or with nothing drawn, is refused by `name`.
 */
export function portraitBox({ width, height, data }, side, name) {
  if (side > width || side > height) throw new Error(`${name}: ${width} by ${height} pixels hold no portrait ${side} pixels square`);
  const top = clamp(opaqueRows({ width, height, data }).top, 0, height - side);
  let left = width, right = -1;
  for (let y = top; y < top + side; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }
  if (right < 0) throw new Error(`${name}: nothing is drawn to cut a portrait from`);
  return { left: clamp(Math.round((left + right + 1 - side) / 2), 0, width - side), top, width: side, height: side };
}

/**
 * The set's clips from its frames' names: `walk-east-0` to `walk-east-5` are
 * the animation `walk-east`, and a name with no number, `still-south` or
 * `standing`, is a clip of one frame. A clip with a frame missing is refused.
 */
export function clipsOf(set, frames) {
  const clips = new Map();
  for (const frame of frames) {
    const numbered = /^(.+)-(\d+)$/.exec(frame.name);
    const clip = numbered ? numbered[1] : frame.name;
    const index = numbered ? Number(numbered[2]) : 0;
    const list = clips.get(clip) ?? [];
    if (list[index]) throw new Error(`${set}: two frames are ${frame.name}`);
    list[index] = frame;
    clips.set(clip, list);
  }
  for (const [clip, list] of clips) {
    const missing = Array.from(list.keys()).find((i) => !list[i]);
    if (missing !== undefined) throw new Error(`${set}: ${clip} has no frame ${missing}`);
  }
  return clips;
}

/** The eight pixels around one, for an outline that closes a glyph's corners. */
const AROUND = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

/**
 * A font's glyphs as frames, cut from its atlas (assets.md, rule 37): the
 * atlas is the service's own, one cell for each character in the order its
 * provenance records, black on transparent, and a scene draws a glyph as a
 * sprite. Each glyph asked for becomes a frame named for its character: its
 * cell cut to the columns it fills, filled with `ink`, with one pixel of
 * `outline` around it, so that it reads on any ground. Every frame is as
 * tall as a cell and its outline, so the glyphs of a row share their rows.
 * A glyph the atlas does not hold, or holds empty, is refused.
 */
export function glyphFrames({ set, atlas, layout, glyphs, ink, outline }) {
  const { glyphPx, columns, characters } = layout ?? {};
  if (!Number.isInteger(glyphPx) || !Number.isInteger(columns) || typeof characters !== "string") throw new Error(`${set}: its provenance gives the atlas no glyphPx, columns and characters`);
  const rows = Math.ceil(characters.length / columns);
  if (atlas.width !== columns * glyphPx || atlas.height !== rows * glyphPx) {
    throw new Error(`${set}: its atlas is ${atlas.width} by ${atlas.height}, and its provenance says ${columns * glyphPx} by ${rows * glyphPx}`);
  }
  return glyphs.map((glyph) => {
    const cell = characters.indexOf(glyph);
    if (cell < 0) throw new Error(`${set}: its atlas has no ${glyph}`);
    const cellX = (cell % columns) * glyphPx;
    const cellY = Math.floor(cell / columns) * glyphPx;
    const filled = (x, y) => x >= 0 && y >= 0 && x < glyphPx && y < glyphPx && atlas.data[((cellY + y) * atlas.width + cellX + x) * 4 + 3] > 0;
    const used = range(glyphPx).filter((x) => range(glyphPx).some((y) => filled(x, y)));
    if (used.length === 0) throw new Error(`${set}: its ${glyph} is empty`);
    const left = used[0];
    const width = used.at(-1) - left + 3;
    const height = glyphPx + 2;
    const data = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // The frame's pixel in the cell: one pixel of outline on every side.
        const gx = left + x - 1;
        const gy = y - 1;
        if (filled(gx, gy)) data.set(ink, (y * width + x) * 4);
        else if (AROUND.some(([dx, dy]) => filled(gx + dx, gy + dy))) data.set(outline, (y * width + x) * 4);
      }
    }
    return { name: glyph, width, height, data };
  });
}

/** Refuses a clip whose frames are not as many as the set's provenance says, so a frame left out of a commit fails the build. */
function checkCounts(set, kind, clips, provenance) {
  for (const [name, animation] of Object.entries(provenance.animations ?? {})) {
    const stated = kind === "figure" ? animation.framesPerDirection : animation.frames;
    if (stated === undefined) continue;
    const names = kind === "figure" ? (animation.directions ?? []).map((d) => `${name}-${d}`) : [name];
    for (const clip of names) {
      const found = clips.get(clip)?.length ?? 0;
      if (found !== stated) throw new Error(`${set}: ${clip} has ${found} frames, and its provenance says ${stated}`);
    }
  }
}

/** How the provenance says a set plays, as much as a scene reads (assets.md, rules 11, 28, 30 and 33). */
function playOf(set, kind, clips, provenance) {
  const animations = provenance.animations ?? {};
  if (kind === "figure") return { actHold: animations.act?.holdFrame ?? 0 };
  // A font plays nothing: a scene reads its glyphs' pictures and no more.
  if (kind === "font") return {};
  if (kind === "prop") {
    // A down marked fadeAboveEnd fades the rows above its last frame's picture (rule 30).
    const last = clips.get("down")?.at(-1);
    return { fadeAbove: animations.down?.fadeAboveEnd === true && last ? opaqueRows(last).top : null };
  }
  const swing = animations.swing;
  const frames = clips.get("swing")?.length ?? 0;
  if (!swing || typeof swing.holdFrame !== "number" || !Array.isArray(swing.grips)) throw new Error(`${set}: its provenance gives the swing no holdFrame and grips`);
  if (swing.grips.length !== frames) throw new Error(`${set}: ${swing.grips.length} grips for ${frames} frames of the swing`);
  if (swing.nocks && swing.nocks.length !== frames) throw new Error(`${set}: ${swing.nocks.length} nocks for ${frames} frames of the swing`);
  return { swing: { holdFrame: swing.holdFrame, grips: swing.grips, frameMs: swing.frameMs ?? [], nocks: swing.nocks ?? null } };
}

/**
 * A picture's published name, for one that is copied as it is and read
 * beside a fact the build measured from it: `level-1` is
 * `level-1.<hash>.png`, the hash of the file, so that a picture made again
 * is a new name and the fact always belongs to the picture it is read with.
 */
export function pictureName(name, file) {
  return `${name}.${createHash("sha256").update(file).digest("hex").slice(0, 12)}.png`;
}

/**
 * One set's sheet: `image`, the frames laid out with a pixel between them,
 * and `json`, the atlas as PixiJS reads it with the set's own facts under
 * `set`. `frames` are the set's pictures as RGBA, each named for its file
 * without the extension; `set` is `<area>/<name>`, for a failure's message.
 *
 * The image is named for its pixels, `sheet.<hash>.png`, and the atlas
 * names it. Everything under /art is published to be kept for a year
 * (scripts/publish-client.sh), which is right for a picture whose name
 * changes when it does and wrong for an atlas, whose frames must be those
 * of the picture beside it: sheet.json is published to be read again within
 * a minute, and so always names the image it was packed with.
 */
export function packSet({ set, kind, frames, provenance }) {
  if (frames.length === 0) throw new Error(`${set}: no frames`);
  const clips = clipsOf(set, frames);
  const absent = SET_CLIPS[kind].filter((clip) => !clips.has(clip));
  if (absent.length > 0) throw new Error(`${set}: no ${absent.join(", ")}`);
  checkCounts(set, kind, clips, provenance);

  const packer = new MaxRectsPacker(MAX_SIDE, MAX_SIDE, PADDING, { smart: true, pot: false, square: false, allowRotation: false });
  // In name order, so that the same frames always make the same sheet.
  const ordered = sortBy(frames, [(frame) => frame.name]);
  packer.addArray(ordered.map((frame) => ({ width: frame.width, height: frame.height, data: frame })));
  const [bin, ...more] = packer.bins;
  if (!bin || more.length > 0) throw new Error(`${set}: its frames do not fit one sheet of ${MAX_SIDE} by ${MAX_SIDE}`);

  const image = { width: bin.width, height: bin.height, data: Buffer.alloc(bin.width * bin.height * 4) };
  const atlas = {};
  for (const rect of bin.rects) {
    const frame = rect.data;
    for (let y = 0; y < frame.height; y++) {
      frame.data.copy(image.data, ((rect.y + y) * image.width + rect.x) * 4, y * frame.width * 4, (y + 1) * frame.width * 4);
    }
    atlas[frame.name] = {
      frame: { x: rect.x, y: rect.y, w: frame.width, h: frame.height },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: frame.width, h: frame.height },
      sourceSize: { w: frame.width, h: frame.height },
    };
  }

  const hash = createHash("sha256").update(`${image.width}x${image.height}:`).update(image.data).digest("hex").slice(0, 12);
  image.name = `sheet.${hash}.png`;

  const names = [...clips.keys()].sort();
  const json = {
    frames: Object.fromEntries(ordered.map((frame) => [frame.name, atlas[frame.name]])),
    animations: Object.fromEntries(names.map((clip) => [clip, clips.get(clip).map((frame) => frame.name)])),
    meta: { image: image.name, format: "RGBA8888", size: { w: image.width, h: image.height }, scale: "1" },
    set: {
      kind,
      // The row a clip stands on: the lowest opaque row of its first frame (rules 11 and 31).
      feet: Object.fromEntries(names.map((clip) => [clip, opaqueRows(clips.get(clip)[0]).bottom])),
      ...playOf(set, kind, clips, provenance),
    },
  };
  return { image, json };
}
