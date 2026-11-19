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
import { MaxRectsPacker } from "maxrects-packer";

/** The areas under art/ whose sets are packed, and what kind of set each holds. */
export const PACKED_AREAS = { heroes: "figure", monsters: "figure", props: "prop", weapons: "weapon" };

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
 * One set's sheet: `image`, the frames laid out with a pixel between them,
 * and `json`, the atlas as PixiJS reads it with the set's own facts under
 * `set`. `frames` are the set's pictures as RGBA, each named for its file
 * without the extension; `set` is `<area>/<name>`, for a failure's message.
 */
export function packSet({ set, kind, frames, provenance }) {
  if (frames.length === 0) throw new Error(`${set}: no frames`);
  const clips = clipsOf(set, frames);
  checkCounts(set, kind, clips, provenance);

  const packer = new MaxRectsPacker(MAX_SIDE, MAX_SIDE, PADDING, { smart: true, pot: false, square: false, allowRotation: false });
  // In name order, so that the same frames always make the same sheet.
  const ordered = [...frames].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
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

  const names = [...clips.keys()].sort();
  const json = {
    frames: Object.fromEntries(ordered.map((frame) => [frame.name, atlas[frame.name]])),
    animations: Object.fromEntries(names.map((clip) => [clip, clips.get(clip).map((frame) => frame.name)])),
    meta: { image: "sheet.png", format: "RGBA8888", size: { w: image.width, h: image.height }, scale: "1" },
    set: {
      kind,
      // The row a clip stands on: the lowest opaque row of its first frame (rules 11 and 31).
      feet: Object.fromEntries(names.map((clip) => [clip, opaqueRows(clips.get(clip)[0]).bottom])),
      ...playOf(set, kind, clips, provenance),
    },
  };
  return { image, json };
}
