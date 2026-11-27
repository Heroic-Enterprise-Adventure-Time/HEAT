// Stylelint: the stylesheets' floor, as ESLint is the TypeScript's
// (docs/standards/typescript.md, rule 16; docs/standards/angular.md, rule 17).
// Run by `npm run lint:styles` at the root and by the gate job "Lint the
// stylesheets". The published set, stylelint-config-standard, is taken whole;
// over it, the rules of decision 0061: outside the client's styles.css, no
// colour is a literal and no length is in px, even one used once, and no
// stylesheet reads the palette, only the role tokens mapped onto it. A pixel
// of the art, such as a frame's outline, is a token in styles.css, so the lint
// never has to tell an art pixel from a layout one.
import { paletteNames } from './packages/client/scripts/style-tokens.mjs';

const TOKENS = 'packages/client/src/styles.css';
/** A var() of a palette colour, read from styles.css so that no second copy of the palette's names is kept. */
const PALETTE = new RegExp(`var\\(\\s*(${paletteNames().join('|')})\\s*[,)]`);

export default {
  // Build output and Angular's cache; node_modules is ignored by default.
  ignoreFiles: ['**/dist/**', '**/.angular/**', 'packages/client/generated/**'],
  extends: ['stylelint-config-standard'],
  rules: {
    'color-no-hex': true,
    'color-named': 'never',
    // The colour functions write a colour as a literal; color-mix over role tokens stays allowed. light-dark is refused because there is one theme.
    'function-disallowed-list': ['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color', 'light-dark'],
    'unit-disallowed-list': ['px'],
    'declaration-property-value-disallowed-list': [{ '/.*/': [PALETTE] }, { message: 'Read a role token; only styles.css reads the palette (decision 0061).' }],
  },
  overrides: [
    {
      // The tokens' one home: the palette's literals and the art's pixels are declared here, and the roles read the palette.
      files: [TOKENS],
      rules: {
        'color-no-hex': null,
        'unit-disallowed-list': null,
        'declaration-property-value-disallowed-list': null,
      },
    },
  ],
};
