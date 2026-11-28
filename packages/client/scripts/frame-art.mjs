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
 * A frame whose inside is cleared (Issue-444): every pixel its inner outline,
 * of the colour `ink`, encloses, flooded from the middle of its box, made
 * transparent, so that what the frame is drawn round shows up to its band
 * and no mat of the art's stands between them. A copy; the picture is not
 * changed. The flood is refused if it reaches a transparent pixel or the
 * picture's edge, which an outline with a gap would let it do.
 */
export function clearInside({ width, height, data }, box, ink, name) {
  const colour = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(ink ?? "")?.slice(1).map((hex) => parseInt(hex, 16));
  if (!colour) throw new Error(`art/frames/${name}: its inside's outline is ${ink}, not a colour as #rrggbb`);
  const cleared = Buffer.from(data);
  const seen = new Uint8Array(width * height);
  const stack = [[box.left + Math.floor(box.width / 2), box.top + Math.floor(box.height / 2)]];
  while (stack.length > 0) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) throw new Error(`art/frames/${name}: its inside reaches the picture's edge, so its outline ${ink} does not close`);
    const pixel = y * width + x;
    if (seen[pixel]) continue;
    seen[pixel] = 1;
    const at = pixel * 4;
    if (cleared[at + 3] === 0) throw new Error(`art/frames/${name}: its inside reaches a transparent pixel, so its outline ${ink} does not close`);
    if (colour.every((value, channel) => cleared[at + channel] === value)) continue;
    cleared[at + 3] = 0;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return { width, height, data: cleared };
}

/**
 * A cleared frame's band checked against its pixels: on each side, every
 * line between the slice's corners is drawn exactly the band's depth from
 * the box's edge and is clear past it, and the band is no deeper than the
 * slice, so that a border of the band's widths holds the whole edge and the
 * corners alone reach past it.
 */
export function checkBand(name, band, slice, { width, data }, box) {
  const drawn = ([x, y]) => data[((box.top + y) * width + box.left + x) * 4 + 3] !== 0;
  const across = { from: slice.left, to: box.width - slice.right, deepest: box.height };
  const down = { from: slice.top, to: box.height - slice.bottom, deepest: box.width };
  const edges = {
    top: { ...across, at: (line, d) => [line, d] },
    right: { ...down, at: (line, d) => [box.width - 1 - d, line] },
    bottom: { ...across, at: (line, d) => [line, box.height - 1 - d] },
    left: { ...down, at: (line, d) => [d, line] },
  };
  for (const side of SIDES) {
    const depth = band?.[side];
    if (!Number.isInteger(depth) || depth < 1 || depth > slice[side]) throw new Error(`art/frames/${name}: its band's ${side} is ${depth}, not a whole number of pixels from 1 to its slice's ${slice[side]}`);
    const { from, to, deepest, at } = edges[side];
    for (let line = from; line < to; line++) {
      let run = 0;
      while (run < deepest && drawn(at(line, run))) run++;
      if (run !== depth) throw new Error(`art/frames/${name}: its ${side} edge is drawn ${run} pixels deep at ${line}, and its band says ${depth}`);
    }
  }
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
 * art is a pixel of the page; and the border the frame stands in, as
 * `--frame-<name>-border` and each side on its own, `--frame-<name>-top` and
 * the rest, for a calc() or the page's layout arithmetic to read: the slice
 * again, or a cleared frame's band, which its corners overlap (Issue-444).
 * `frames` maps a frame's name to `{ image, slice, band }`, the picture's
 * published name under /art/frames, and `band` only for a cleared frame.
 */
export function frameStyles(frames) {
  const lines = sortBy(Object.entries(frames), [([name]) => name])
    .flatMap(([name, { image, slice, band = slice }]) => [
      `  --frame-${name}-image: url("/art/frames/${image}");`,
      `  --frame-${name}-slice: ${SIDES.map((side) => slice[side]).join(" ")};`,
      `  --frame-${name}-width: ${SIDES.map((side) => `${slice[side]}px`).join(" ")};`,
      `  --frame-${name}-border: ${SIDES.map((side) => `${band[side]}px`).join(" ")};`,
      ...SIDES.map((side) => `  --frame-${name}-${side}: ${band[side]}px;`),
    ]);
  return `/* Written by packages/client/scripts/copy-art.mjs from art/frames; not committed. */\n:root {\n${lines.join("\n")}\n}\n`;
}
