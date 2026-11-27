// The page's colours for a script that draws with them: read from the
// stylesheet's tokens, src/styles.css, so that no script holds a copy of one
// (docs/process/assets.md, rule 39; docs/standards/angular.md, rule 17). A
// script reads a role, such as --scene-glyph, which styles.css maps onto a
// colour of the palette (decision 0061).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const STYLES = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");

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
    const hex = /^#([0-9a-f]{6})$/i.exec(value)?.[1];
    if (hex) return [0, 2, 4].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).concat(255);
    const next = /^var\((--[\w-]+)\)$/.exec(value)?.[1];
    if (!next) throw new Error(`src/styles.css gives ${token} no colour: ${value}`);
    token = next;
  }
}

/** The palette's names, every token whose value is a colour literal, as the stylesheet lint reads them. */
export function paletteNames(styles = STYLES) {
  return [...styles.matchAll(/^\s*(--[\w-]+):\s*#[0-9a-f]{3,8};/gim)].map((match) => match[1]);
}
