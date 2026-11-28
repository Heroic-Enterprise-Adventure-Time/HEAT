import frames from '../../../generated/frames.css' with { loader: 'text' };
import styles from '../../styles.css' with { loader: 'text' };

/**
 * The tokens of styles.css, and of generated/frames.css, which the build
 * writes from the art before the specs run (`pretest`), for a spec, read
 * from the stylesheets themselves: jsdom
 * loads no stylesheet, and a spec that wrote a token's value again would go
 * on passing after the stylesheet changed (angular.md, rule 17; typescript.md,
 * rule 24). The build hands each file over as text, by the import's `loader`
 * attribute, declared in `css-text.d.ts` beside this file.
 */

/** Every custom property the two declare, by its name, as it is written. */
const DECLARED = new Map<string, string>();
for (const match of (frames + styles).matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)) {
  const [, name, value] = match;
  if (name !== undefined && value !== undefined) DECLARED.set(name, value.trim());
}

/** A token as `getComputedStyle` hands it back: each `var()` in it followed to what it names, and empty for a token the stylesheet does not declare. */
function computed(token: string): string {
  return (DECLARED.get(token) ?? '').replace(/var\((--[\w-]+)\)/g, (_, named: string) => computed(named));
}

/** The root element's computed style as a browser has it with both loaded, at a root font size: the default, 16px, unless a test says another. */
export function rootStyle(fontSize = '16px'): Pick<CSSStyleDeclaration, 'fontSize' | 'getPropertyValue'> {
  return { fontSize, getPropertyValue: computed };
}
