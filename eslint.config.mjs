// ESLint: the deterministic floor of review (docs/standards/typescript.md,
// rule 16). One flat config for every workspace, run by `npm run lint` at the
// root and by "Build and test" beside the typecheck. A rule is turned off here
// only with its reason; a rule the code cannot meet yet is held back by file
// pattern at the end, naming the issue that removes the hold-back.
import js from '@eslint/js';
import graphql from '@graphql-eslint/eslint-plugin';
import angular from 'angular-eslint';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const heldBack = (files, issue, rules) => ({
  name: `held back until Issue-${issue}`,
  files,
  rules: Object.fromEntries(rules.map((rule) => [rule, 'off'])),
});

export default tseslint.config(
  // Build output, Angular's cache and the client's copy of the art.
  // node_modules and .git are ignored by default.
  { ignores: ['**/dist/', '**/.angular/', 'packages/client/generated/'] },

  // Plain JavaScript: the scripts, the client's build helpers and this file.
  {
    files: ['**/*.{js,mjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },

  // CloudFront Functions (terraform/modules/site): scripts, not modules, whose
  // entry point `handler` is called by name.
  {
    files: ['terraform/**/*.js'],
    languageOptions: { sourceType: 'script' },
    rules: { 'no-unused-vars': ['error', { varsIgnorePattern: '^handler$' }] },
  },

  // Every TypeScript file, with type information from its package's tsconfig.
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      // Strict rejects a number inside `${}`; recommended allows it. Every
      // such number here is game prose, an asset frame or a size, whose
      // string form is what the code wants, and String() would add nothing.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Rewrites `x as T` into `x!`, which strict's no-non-null-assertion then
      // forbids: a value that may be absent is narrowed instead (rule 6).
      '@typescript-eslint/non-nullable-type-assertion-style': 'off',
      // An unused name that starts with `_` is deliberate: a parameter a
      // signature requires, or a rest-destructuring that drops a key.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },

  // The client: Angular's rules for components, and its template rules for
  // templates in .html files and, through the processor, inline ones.
  {
    files: ['packages/client/**/*.ts'],
    extends: [...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/component-selector': ['error', { type: 'element', prefix: 'heat', style: 'kebab-case' }],
      '@angular-eslint/directive-selector': ['error', { type: 'attribute', prefix: 'heat', style: 'camelCase' }],
      // Templates and styles live in their own files beside the component;
      // Issue-149 moves the inline ones and writes the sentence into
      // docs/standards/typescript.md.
      '@angular-eslint/component-max-inline-declarations': ['error', { template: 0, styles: 0, animations: 0 }],
    },
  },
  {
    files: ['packages/client/**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
  },

  // The committed schema, printed from the Pothos builder (rule 11).
  {
    files: ['**/*.graphql'],
    languageOptions: { parser: graphql.parser, parserOptions: { graphQLConfig: { schema: 'packages/hub/schema.graphql' } } },
    plugins: { '@graphql-eslint': graphql },
    rules: {
      ...graphql.configs['flat/schema-recommended'].rules,
      // Relay's convention, `id: ID!` on every object type. The API's value
      // types (Reward, Holding, UnitStats) have no identity, and its ids are
      // strings keyed by the hub, not global ids.
      '@graphql-eslint/strict-id-in-types': 'off',
    },
  },

  // Held back: the rules each area cannot meet yet, off for that area only,
  // and listed under "Held back" in docs/standards/typescript.md. The issue
  // named removes the block and fixes the findings it uncovers.
  heldBack(['packages/client/**/*.ts', 'packages/client/**/*.html'], 149, [
    '@angular-eslint/component-max-inline-declarations',
    '@typescript-eslint/dot-notation',
    '@typescript-eslint/no-base-to-string',
    '@typescript-eslint/no-confusing-void-expression',
    '@typescript-eslint/no-extraneous-class',
    '@typescript-eslint/no-meaningless-void-operator',
    '@typescript-eslint/no-non-null-assertion',
    '@typescript-eslint/no-unnecessary-condition',
    '@typescript-eslint/no-unsafe-assignment',
    'no-useless-assignment',
    '@typescript-eslint/require-await',
    '@typescript-eslint/use-unknown-in-catch-callback-variable',
  ]),
);
