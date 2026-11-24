// The page's colours for a script that draws with them: read from the
// stylesheet's tokens, src/styles.css, so that no script holds a copy of one
// (docs/process/assets.md, rule 39; docs/standards/angular.md, rule 17).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const styles = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");

/** A colour of the page's palette as RGBA, by its token's name, `--ink`: opaque, as every token of the palette is. */
export function colourToken(name) {
  const hex = new RegExp(`${name}:\\s*#([0-9a-f]{6});`, "i").exec(styles)?.[1];
  if (!hex) throw new Error(`src/styles.css has no colour ${name}`);
  return [0, 2, 4].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)).concat(255);
}
