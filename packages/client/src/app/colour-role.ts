/**
 * A colour role of styles.css for what draws on a canvas, where no
 * stylesheet reaches: the scene asks for the role by its token and draws with
 * what the page has, so that no colour is written in TypeScript (angular.md,
 * rule 17; best-practices.md, rule 10). A build script reads the same roles
 * from the file, through `colourToken` of `scripts/style-tokens.mjs`.
 */

/** A colour of the palette as the stylesheet writes it: six hex digits, opaque, as `scripts/style-tokens.mjs` reads it. */
const PALETTE_COLOUR = /^#[0-9a-f]{6}$/i;

/**
 * A role's colour from the root element's computed style, where the role's
 * `var()` is already followed to the palette's colour. Pure in its argument,
 * so a test hands it a style of its own; a token that is missing or is no
 * colour of the palette is a mistake in styles.css and fails here with its
 * name, as `readLayoutSizes` does.
 */
export function readColourRole(root: Pick<CSSStyleDeclaration, 'getPropertyValue'>, token: string): string {
  const value = root.getPropertyValue(token).trim();
  if (!PALETTE_COLOUR.test(value)) throw new Error(`styles.css: ${token} is "${value}", not a colour a scene can draw with`);
  return value;
}
