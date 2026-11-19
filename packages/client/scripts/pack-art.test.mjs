// Run by `node --test`, from the client's `npm test`, before its specs.
import assert from "node:assert/strict";
import { test } from "node:test";

import { clipsOf, opaqueRows, packSet } from "./pack-art.mjs";

/** A picture of one colour per frame, opaque on the rows from `top` to `bottom` and transparent elsewhere. */
function picture(name, width, height, top, bottom, shade = 200) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = top; y <= bottom; y++) {
    for (let x = 0; x < width; x++) data.set([shade, shade, shade, 255], (y * width + x) * 4);
  }
  return { name, width, height, data };
}

const pixel = (image, x, y) => [...image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)];

/** A figure's frames, every clip the scenes ask for: the four stills, a walk east of three, and one frame of each other animation, each frame its own shade. */
const figure = () => [
  ...["south", "east", "north", "west"].map((d, i) => picture(`still-${d}`, 8, 8, 1, 5, 10 + i)),
  picture("walk-east-0", 12, 12, 2, 9, 20),
  picture("walk-east-1", 12, 12, 2, 10, 30),
  picture("walk-east-2", 12, 12, 3, 11, 40),
  ...["walk-south", "walk-north", "stance-east", "act-east", "hit-east", "down-east"].map((clip, i) => picture(`${clip}-0`, 12, 12, 2, 8, 50 + i)),
];
const figureProvenance = { animations: { walk: { directions: ["east"], framesPerDirection: 3 }, act: { directions: [], holdFrame: 2 } } };

test("opaqueRows finds the highest and lowest rows that hold a pixel", () => {
  assert.deepEqual(opaqueRows(picture("a", 4, 8, 2, 5)), { top: 2, bottom: 5 });
});

test("opaqueRows answers the top row for an empty picture", () => {
  assert.deepEqual(opaqueRows({ name: "empty", width: 4, height: 8, data: Buffer.alloc(4 * 8 * 4) }), { top: 0, bottom: 0 });
});

test("clipsOf reads an animation from its numbered frames, in order, and a still as a clip of one", () => {
  const clips = clipsOf("heroes/test", figure().reverse());
  assert.equal(clips.size, 11);
  assert.deepEqual(clips.get("walk-east").map((f) => f.name), ["walk-east-0", "walk-east-1", "walk-east-2"]);
  assert.deepEqual(clips.get("still-south").map((f) => f.name), ["still-south"]);
});

test("clipsOf refuses an animation with a frame missing, naming the set", () => {
  const frames = figure().filter((f) => f.name !== "walk-east-1");
  assert.throws(() => clipsOf("heroes/test", frames), /^Error: heroes\/test: walk-east has no frame 1$/);
});

test("packSet writes every frame's pixels where the atlas says, with a pixel between any two", () => {
  const frames = figure();
  const { image, json } = packSet({ set: "heroes/test", kind: "figure", frames, provenance: figureProvenance });
  assert.deepEqual(json.meta, { image: "sheet.png", format: "RGBA8888", size: { w: image.width, h: image.height }, scale: "1" });
  assert.equal(image.data.length, image.width * image.height * 4);
  for (const frame of frames) {
    const at = json.frames[frame.name].frame;
    assert.deepEqual([at.w, at.h], [frame.width, frame.height]);
    assert.deepEqual(json.frames[frame.name].sourceSize, { w: frame.width, h: frame.height });
    for (const [x, y] of [[0, 0], [frame.width - 1, frame.height - 1], [3, 4]]) {
      assert.deepEqual(pixel(image, at.x + x, at.y + y), pixel(frame, x, y), `${frame.name} at ${x},${y}`);
    }
  }
  const boxes = Object.values(json.frames).map((f) => f.frame);
  for (const a of boxes) {
    for (const b of boxes) {
      if (a === b) continue;
      const apart = a.x + a.w + 1 <= b.x || b.x + b.w + 1 <= a.x || a.y + a.h + 1 <= b.y || b.y + b.h + 1 <= a.y;
      assert.ok(apart, `${JSON.stringify(a)} and ${JSON.stringify(b)} touch`);
    }
  }
});

test("packSet names each clip's frames in order, and the row each clip's first frame stands on", () => {
  const { json } = packSet({ set: "heroes/test", kind: "figure", frames: figure(), provenance: figureProvenance });
  assert.deepEqual(json.animations["still-south"], ["still-south"]);
  assert.deepEqual(json.animations["walk-east"], ["walk-east-0", "walk-east-1", "walk-east-2"]);
  assert.deepEqual(Object.keys(json.set), ["kind", "feet", "actHold"]);
  assert.deepEqual([json.set.kind, json.set.actHold], ["figure", 2]);
  assert.deepEqual([json.set.feet["still-south"], json.set.feet["walk-east"], json.set.feet["act-east"]], [5, 9, 8]);
});

test("packSet makes the same sheet whatever order the frames come in", () => {
  const one = packSet({ set: "heroes/test", kind: "figure", frames: figure(), provenance: figureProvenance });
  const other = packSet({ set: "heroes/test", kind: "figure", frames: figure().reverse(), provenance: figureProvenance });
  assert.equal(JSON.stringify(other.json), JSON.stringify(one.json));
  assert.ok(other.image.data.equals(one.image.data));
});

test("packSet holds a figure's act on its first frame where the provenance names none", () => {
  const { json } = packSet({ set: "heroes/test", kind: "figure", frames: figure(), provenance: { animations: {} } });
  assert.equal(json.set.actHold, 0);
});

test("packSet refuses a set with fewer frames than its provenance says, naming the set and the clip", () => {
  const provenance = { animations: { walk: { directions: ["east", "north"], framesPerDirection: 3 } } };
  assert.throws(
    () => packSet({ set: "heroes/test", kind: "figure", frames: figure(), provenance }),
    /^Error: heroes\/test: walk-north has 1 frames, and its provenance says 3$/,
  );
});

test("packSet refuses a set without a clip the scenes ask for, naming the set and the clip", () => {
  const frames = figure().filter((f) => f.name !== "act-east-0" && f.name !== "still-west");
  assert.throws(
    () => packSet({ set: "heroes/test", kind: "figure", frames, provenance: figureProvenance }),
    /^Error: heroes\/test: no still-west, act-east$/,
  );
});

test("packSet refuses a set with no frames", () => {
  assert.throws(() => packSet({ set: "props/none", kind: "prop", frames: [], provenance: {} }), /^Error: props\/none: no frames$/);
});

test("packSet gives a prop the top row of its last down frame where its down fades, and none where it does not", () => {
  const frames = [picture("standing", 8, 12, 1, 10), picture("hit-0", 8, 12, 1, 10), picture("down-0", 8, 12, 1, 10), picture("down-1", 8, 12, 7, 10)];
  const fading = { animations: { hit: { frames: 1 }, down: { frames: 2, fadeAboveEnd: true } } };
  assert.deepEqual(packSet({ set: "props/test", kind: "prop", frames, provenance: fading }).json.set, {
    kind: "prop",
    feet: { down: 10, hit: 10, standing: 10 },
    fadeAbove: 7,
  });
  const plain = { animations: { hit: { frames: 1 }, down: { frames: 2 } } };
  assert.equal(packSet({ set: "props/test", kind: "prop", frames, provenance: plain }).json.set.fadeAbove, null);
});

test("packSet carries a weapon's swing as its provenance plays it", () => {
  const frames = [picture("icon", 8, 8, 1, 6), picture("swing-0", 8, 8, 1, 6), picture("swing-1", 8, 8, 1, 6)];
  const swing = { frames: 2, holdFrame: 1, grips: [[3, 4], [4, 4]] };
  assert.deepEqual(packSet({ set: "weapons/test", kind: "weapon", frames, provenance: { animations: { swing } } }).json.set.swing, {
    holdFrame: 1,
    grips: [[3, 4], [4, 4]],
    frameMs: [],
    nocks: null,
  });
  const bow = { ...swing, frameMs: [90], nocks: [[1, 4], [0, 4]] };
  assert.deepEqual(packSet({ set: "weapons/test", kind: "weapon", frames, provenance: { animations: { swing: bow } } }).json.set.swing, {
    holdFrame: 1,
    grips: [[3, 4], [4, 4]],
    frameMs: [90],
    nocks: [[1, 4], [0, 4]],
  });
});

test("packSet refuses a weapon whose grips are not one a frame, or whose provenance gives none", () => {
  const frames = [picture("swing-0", 8, 8, 1, 6), picture("swing-1", 8, 8, 1, 6)];
  assert.throws(
    () => packSet({ set: "weapons/test", kind: "weapon", frames, provenance: { animations: { swing: { frames: 2, holdFrame: 1, grips: [[3, 4]] } } } }),
    /^Error: weapons\/test: 1 grips for 2 frames of the swing$/,
  );
  assert.throws(
    () => packSet({ set: "weapons/test", kind: "weapon", frames, provenance: { animations: {} } }),
    /^Error: weapons\/test: its provenance gives the swing no holdFrame and grips$/,
  );
});
