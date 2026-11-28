// Run by `node --test`, from the client's `npm test`, before its specs.
import assert from "node:assert/strict";
import { test } from "node:test";

import { checkBand, checkFrameNames, checkSlice, clearInside, frameStyles, opaqueBox, portraitStyle } from "./frame-art.mjs";

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

test("the stylesheet names each frame's picture, its slice and a border of the same pixels, side by side, in order of name", () => {
  const css = frameStyles({
    primary: { image: "primary.abc.png", slice: { top: 8, right: 10, bottom: 12, left: 10 } },
    panel: { image: "panel.def.png", slice: { top: 26, right: 26, bottom: 26, left: 26 } },
  });
  assert.match(css, /:root \{\n {2}--frame-panel-image: url\("\/art\/frames\/panel\.def\.png"\);\n {2}--frame-panel-slice: 26 26 26 26;\n {2}--frame-panel-width: 26px 26px 26px 26px;\n/);
  assert.match(css, /--frame-panel-left: 26px;\n {2}--frame-primary-image/);
  assert.match(
    css,
    /--frame-primary-slice: 8 10 12 10;\n {2}--frame-primary-width: 8px 10px 12px 10px;\n {2}--frame-primary-border: 8px 10px 12px 10px;\n {2}--frame-primary-top: 8px;\n {2}--frame-primary-right: 10px;\n {2}--frame-primary-bottom: 12px;\n {2}--frame-primary-left: 10px;\n\}\n$/,
  );
});

test("a cleared frame's band is the border it stands in, and its sides are the band's", () => {
  const css = frameStyles({ region: { image: "region.abc.png", slice: { top: 11, right: 11, bottom: 12, left: 11 }, band: { top: 8, right: 8, bottom: 8, left: 7 } } });
  assert.match(css, /--frame-region-width: 11px 11px 12px 11px;\n {2}--frame-region-border: 8px 8px 8px 7px;\n {2}--frame-region-top: 8px;\n {2}--frame-region-right: 8px;\n {2}--frame-region-bottom: 8px;\n {2}--frame-region-left: 7px;\n/);
});

/** A frame 12 by 10: an ink ring one pixel in from its edge, wood outside it, a mat inside it; `gap` opens the ring's top at that column. */
function ringed(gap) {
  const width = 12, height = 10;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      const ring = (x === 1 || x === width - 2 || y === 1 || y === height - 2) && x >= 1 && x <= width - 2 && y >= 1 && y <= height - 2 && !(y === 1 && x === gap);
      data.set(ring ? [0x5a, 0x43, 0x30, 255] : [0xc9, 0xb4, 0x8e, 255], at);
    }
  }
  return { width, height, data };
}
const RINGED_BOX = { left: 0, top: 0, width: 12, height: 10 };

test("a frame's inside is cleared up to its ink outline, and the picture it was given is not changed", () => {
  const picture = ringed();
  const cleared = clearInside(picture, RINGED_BOX, "#5a4330", "region");
  const alpha = (p, x, y) => p.data[(y * p.width + x) * 4 + 3];
  assert.equal(alpha(cleared, 5, 5), 0);
  assert.equal(alpha(cleared, 2, 2), 0);
  assert.equal(alpha(cleared, 1, 1), 255);
  assert.equal(alpha(cleared, 0, 0), 255);
  assert.equal(alpha(picture, 5, 5), 255);
});

test("an outline with a gap is refused, since the clearing would run out past the band", () => {
  assert.throws(() => clearInside(ringed(5), RINGED_BOX, "#5a4330", "region"), /art\/frames\/region: its inside reaches the picture's edge/);
  assert.throws(() => clearInside(ringed(), RINGED_BOX, "ink", "region"), /not a colour as #rrggbb/);
});

test("a band is checked along every edge between the corners, and no deeper than the slice", () => {
  const cleared = clearInside(ringed(), RINGED_BOX, "#5a4330", "region");
  const slice = { top: 3, right: 3, bottom: 3, left: 3 };
  assert.doesNotThrow(() => checkBand("region", { top: 2, right: 2, bottom: 2, left: 2 }, slice, cleared, RINGED_BOX));
  assert.throws(() => checkBand("region", { top: 2, right: 2, bottom: 2, left: 1 }, slice, cleared, RINGED_BOX), /its left edge is drawn 2 pixels deep at 3, and its band says 1/);
  assert.throws(() => checkBand("region", { top: 4, right: 2, bottom: 2, left: 2 }, slice, cleared, RINGED_BOX), /its band's top is 4, not a whole number of pixels from 1 to its slice's 3/);
});

test("the provenance names the frames the page reads, in any order, or the build fails", () => {
  assert.doesNotThrow(() => checkFrameNames(["secondary", "panel", "primary"], ["panel", "primary", "secondary"]));
  assert.throws(() => checkFrameNames(["panel", "primary"], ["panel", "primary", "secondary"]), /names the frames panel, primary, and the page reads panel, primary, secondary/);
  assert.throws(() => checkFrameNames(["panel", "primary", "button"], ["panel", "primary", "secondary"]), /FRAMES in src\/app\/sprite-sets.ts/);
});

test("the portrait's size is its side at its scale", () => {
  assert.equal(portraitStyle({ side: 24, scale: 2 }), ":root {\n  --portrait: 48px;\n}\n");
});
