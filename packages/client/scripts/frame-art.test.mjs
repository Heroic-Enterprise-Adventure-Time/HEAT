// Run by `node --test`, from the client's `npm test`, before its specs.
import assert from "node:assert/strict";
import { test } from "node:test";

import { checkFrameNames, checkSlice, frameStyles, opaqueBox, portraitStyle } from "./frame-art.mjs";

/** A picture `width` by `height`, transparent but for an opaque box at `left`, `top`, `w` by `h`. */
function picture(width, height, left, top, w, h) {
  const data = Buffer.alloc(width * height * 4);
  for (let y = top; y < top + h; y++) for (let x = left; x < left + w; x++) data[(y * width + x) * 4 + 3] = 255;
  return { width, height, data };
}

test("a frame is trimmed to the box its pixels fill", () => {
  assert.deepEqual(opaqueBox(picture(20, 12, 3, 2, 10, 7), "panel"), { left: 3, top: 2, width: 10, height: 7 });
});

test("a frame with no pixel drawn is refused, by its name", () => {
  assert.throws(() => opaqueBox(picture(4, 4, 0, 0, 0, 0), "panel"), /art\/frames\/panel: no pixel is drawn/);
});

test("a slice leaves a middle on each axis, in whole pixels", () => {
  const box = { left: 0, top: 0, width: 20, height: 10 };
  assert.doesNotThrow(() => checkSlice("primary", { top: 4, right: 9, bottom: 5, left: 10 }, box));
  assert.throws(() => checkSlice("primary", { top: 4, right: 10, bottom: 5, left: 10 }, box), /left and right, 10 and 10, leave no middle/);
  assert.throws(() => checkSlice("primary", { top: 5, right: 4, bottom: 5, left: 4 }, box), /top and bottom, 5 and 5, leave no middle/);
  assert.throws(() => checkSlice("primary", { top: 4, right: 4, bottom: 1.5, left: 4 }, box), /bottom is 1.5, not a whole number/);
  assert.throws(() => checkSlice("primary", { top: 4, right: 4, left: 4 }, box), /bottom is undefined/);
});

test("the stylesheet names each frame's picture, its slice and a border of the same pixels, in order of name", () => {
  const css = frameStyles({
    primary: { image: "primary.abc.png", slice: { top: 8, right: 10, bottom: 12, left: 10 } },
    panel: { image: "panel.def.png", slice: { top: 26, right: 26, bottom: 26, left: 26 } },
  });
  assert.match(css, /:root \{\n {2}--frame-panel-image: url\("\/art\/frames\/panel\.def\.png"\);\n {2}--frame-panel-slice: 26 26 26 26;\n {2}--frame-panel-width: 26px 26px 26px 26px;\n {2}--frame-primary-image/);
  assert.match(css, /--frame-primary-slice: 8 10 12 10;\n {2}--frame-primary-width: 8px 10px 12px 10px;\n\}\n$/);
});

test("the provenance names the frames the page reads, in any order, or the build fails", () => {
  assert.doesNotThrow(() => checkFrameNames(["secondary", "panel", "primary"], ["panel", "primary", "secondary"]));
  assert.throws(() => checkFrameNames(["panel", "primary"], ["panel", "primary", "secondary"]), /names the frames panel, primary, and the page reads panel, primary, secondary/);
  assert.throws(() => checkFrameNames(["panel", "primary", "button"], ["panel", "primary", "secondary"]), /FRAMES in src\/app\/sprite-sets.ts/);
});

test("the portrait's size is its side at its scale", () => {
  assert.equal(portraitStyle({ side: 24, scale: 2 }), ":root {\n  --portrait: 48px;\n}\n");
});
