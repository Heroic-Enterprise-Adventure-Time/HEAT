// The page's colours for a script that draws with them: read from the
// stylesheet's tokens, src/styles.css, so that no script holds a copy of one
// (docs/process/assets.md, rule 39; docs/standards/angular.md, rule 17). A
// script reads a role, such as --scene-glyph, which styles.css maps onto a
// colour of the palette (decision 0061).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const STYLES = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");

/** A colour of the palette: six hex digits, opaque. Both functions below read a colour by this one pattern. */
const PALETTE_COLOUR = /^#([0-9a-f]{6})$/i;

/**
 * A colour token as RGBA, by its name, `--scene-glyph`: a role followed
 * through the `var()` it is mapped onto to the palette's colour, opaque, as
 * every colour of the palette is.
 */
export function colourToken(name, styles = STYLES) {
  const seen = new Set();
  let token = name;
  for (;;) {
    if (seen.has(token)) throw new Error(`src/styles.css maps ${name} in a loop`);
    seen.add(token);
    const value = new RegExp(`(?:^|[\\s;{])${token}:\\s*([^;]+);`, "m").exec(styles)?.[1]?.trim();
    if (value === undefined) throw new Error(`src/styles.css has no colour ${token}`);
    const hex = PALETTE_COLOUR.exec(value)?.[1];
    if (hex) return [0, 2, 4].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).concat(255);
    const next = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
    if (!next) throw new Error(`src/styles.css gives ${token} no colour: ${value}`);
    token = next;
  }
}

/**
 * The palette's names, every token whose value is a colour literal, as the
 * stylesheet lint reads them. A literal in any form but six hex digits is
 * refused, so that the lint and colourToken never disagree on what is a
 * colour of the palette.
 */
export function paletteNames(styles = STYLES) {
  return [...styles.matchAll(/^\s*(--[\w-]+):\s*(#\w*);/gm)].map(([, name, value]) => {
    if (!PALETTE_COLOUR.test(value)) throw new Error(`src/styles.css writes ${name} as ${value}, not six hex digits`);
    return name;
  });
}
