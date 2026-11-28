// The page's frames (decision 0062, Issue-385): each 9-slice picture under
// art/frames is trimmed to the box its pixels fill, published under a name
// that carries the trimmed picture's hash, and named with its slice in a
// stylesheet the build writes, generated/frames.css, which angular.json
// takes before src/primitives.css. A primitive reads a frame there as
// custom properties, `--frame-<name>-image`, `--frame-<name>-slice` and
// `--frame-<name>-width`, and so never holds a published name or a pixel of
// the art (docs/process/best-practices.md, rule 10).
//
// Everything here is a function of the pictures it is handed, so that it is
// tested without a file; copy-art.mjs reads the files and writes the result.

import { isEqual, sortBy } from "es-toolkit";

const SIDES = ["top", "right", "bottom", "left"];

/** The smallest box that holds every pixel of a picture that is not transparent; a picture with none is refused. */
export function opaqueBox({ width, height, data }, name) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < 0) throw new Error(`art/frames/${name}: no pixel is drawn`);
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/**
 * A frame's slice checked against its trimmed box: every side a whole number
 * of pixels, at least one, and the two of each axis leaving a middle of at
 * least one pixel, so that border-image has an edge to repeat.
 */
export function checkSlice(name, slice, box) {
  for (const side of SIDES) {
    const inset = slice?.[side];
    if (!Number.isInteger(inset) || inset < 1) throw new Error(`art/frames/${name}: its slice's ${side} is ${inset}, not a whole number of pixels`);
  }
  if (slice.left + slice.right >= box.width) throw new Error(`art/frames/${name}: its slice's left and right, ${slice.left} and ${slice.right}, leave no middle in its ${box.width} pixels`);
  if (slice.top + slice.bottom >= box.height) throw new Error(`art/frames/${name}: its slice's top and bottom, ${slice.top} and ${slice.bottom}, leave no middle in its ${box.height} pixels`);
}

/**
 * Refuses a provenance whose frames are not the page's: `names` as the
 * provenance lists them, `frames` the list the page reads (FRAMES in
 * src/app/sprite-sets.ts), so that a frame renamed or dropped on one side
 * fails the build rather than drawing nothing.
 */
export function checkFrameNames(names, frames) {
  if (!isEqual(sortBy(names, [(name) => name]), sortBy([...frames], [(name) => name]))) {
    throw new Error(`art/frames/provenance.json names the frames ${names.join(", ")}, and the page reads ${frames.join(", ")} (FRAMES in src/app/sprite-sets.ts)`);
  }
}

/** The portrait's size on the page, `--portrait`: its side in art pixels at its scale. */
export function portraitStyle({ side, scale }) {
  return `:root {\n  --portrait: ${side * scale}px;\n}\n`;
}

/**
 * The stylesheet that names every frame: for each, its published picture,
 * its slice in the picture's pixels, and the border that slice is drawn in,
 * the same lengths, so that the frame is drawn at 1× and each pixel of the
 * art is a pixel of the page. `frames` maps a frame's name to `{ image,
 * slice }`, the picture's published name under /art/frames.
 */
export function frameStyles(frames) {
  const lines = sortBy(Object.entries(frames), [([name]) => name])
    .flatMap(([name, { image, slice }]) => [
      `  --frame-${name}-image: url("/art/frames/${image}");`,
      `  --frame-${name}-slice: ${SIDES.map((side) => slice[side]).join(" ")};`,
      `  --frame-${name}-width: ${SIDES.map((side) => `${slice[side]}px`).join(" ")};`,
    ]);
  return `/* Written by packages/client/scripts/copy-art.mjs from art/frames; not committed. */\n:root {\n${lines.join("\n")}\n}\n`;
}
