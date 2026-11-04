// ESLint: the deterministic floor of review (docs/standards/typescript.md,
// rule 16). One flat config for every workspace, run by `npm run lint` at the
// root and by "Build and test" beside the typecheck. A rule is turned off here
// only with its reason; a rule the code cannot meet yet is held back by file
// pattern at the end, naming the issue that removes the hold-back (none today).
import js from '@eslint/js';
import graphql from '@graphql-eslint/eslint-plugin';
import angular from 'angular-eslint';
import perfectionist from 'eslint-plugin-perfectionist';
import testingLibrary from 'eslint-plugin-testing-library';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const testingImports = [
  { name: '@testing-library/angular', message: 'Import from @testing-library/angular/zoneless.' },
  { name: '@angular/router/testing', message: 'Reach a page through renderAt in testing/render-at.ts.' },
];
const testBedImport = { name: '@angular/core/testing', importNames: ['TestBed'], message: 'Render the component through Testing Library.' };

export default tseslint.config(
  // Build output, Angular's cache, the client's copy of the art, and the
  // client's generated GraphQL code (codegen.mjs), which is read as the
  // schema's and its operations' and never edited.
  // node_modules and .git are ignored by default.
  { ignores: ['**/dist/', '**/.angular/', 'packages/client/generated/', 'packages/client/src/app/graphql/generated/'] },

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

  // Imports in one order everywhere, so a new import has one place to go:
  // Node built-ins, packages, the workspace's `@heat/*` packages, local files,
  // a blank line between groups, and module paths and the names inside the
  // braces sorted (docs/standards/typescript.md, rule 16). Perfectionist over
  // import-x's `order`: it is the one released monthly, and it groups by the
  // specifier's text, so it needs no module resolver to tell the groups apart.
  // A type import sorts with its module's group; side-effect imports keep
  // their place. One declaration per module, types inline, since sorting
  // leaves two declarations of one module side by side and a new name could
  // then go in either.
  {
    files: ['**/*.{js,mjs,ts}'],
    plugins: { perfectionist },
    rules: {
      'no-duplicate-imports': ['error', { allowSeparateTypeImports: false }],
      'perfectionist/sort-imports': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'unknown'],
          internalPattern: ['^@heat/'],
        },
      ],
      'perfectionist/sort-named-imports': 'error',
    },
  },

  // The hub logs through the Powertools logger, one JSON line per request
  // and nothing that could hold a player's data (docs/standards/graphql.md,
  // rule 16); nothing in it writes to the console.
  {
    files: ['packages/hub/src/**/*.ts'],
    rules: { 'no-console': 'error' },
  },

  // The client: every one of Angular's component rules, and every one of its
  // template rules for templates in .html files and, through the processor,
  // inline ones (docs/standards/angular.md).
  {
    files: ['packages/client/**/*.ts'],
    extends: [...angular.configs.tsAll],
    processor: angular.processInlineTemplates,
    rules: {
      // A decorated class is instantiated by the framework from its decorator,
      // so a component whose whole content is its template has no members.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      '@angular-eslint/component-selector': ['error', { type: 'element', prefix: 'heat', style: 'kebab-case' }],
      '@angular-eslint/directive-selector': ['error', { type: 'attribute', prefix: 'heat', style: 'camelCase' }],
      // Templates and styles live in their own files beside the component
      // (docs/standards/angular.md, rule 12).
      '@angular-eslint/component-max-inline-declarations': ['error', { template: 0, styles: 0, animations: 0 }],
      // Angular's style guide dropped the Component and Directive suffixes
      // with v20: a class is named for what it shows, `Camp`, not
      // `CampComponent`.
      '@angular-eslint/component-class-suffix': 'off',
      '@angular-eslint/directive-class-suffix': 'off',
      // A root service is `@Service()` (prefer-service-decorator); an
      // `@Injectable()` with no providedIn is one a component provides, so
      // that it lives as long as the component does.
      '@angular-eslint/use-injectable-provided-in': 'off',
    },
  },
  {
    files: ['packages/client/**/*.html'],
    extends: [...angular.configs.templateAll],
    rules: {
      // A signal is read by calling it.
      '@angular-eslint/template/no-call-expression': 'off',
      // The game has one language.
      '@angular-eslint/template/i18n': 'off',
      // Counts the @if and @for blocks a list panel is made of; the logic a
      // template must not hold lives in computed signals instead.
      '@angular-eslint/template/cyclomatic-complexity': 'off',
      // A size the page computes is bound to style; a literal style attribute
      // is still refused, since styles live in the component's stylesheet.
      '@angular-eslint/template/no-inline-styles': ['error', { allowBindToStyle: true }],
    },
  },

  // The client's specs: Testing Library's own rules for Angular
  // (docs/standards/angular.md, rule 15), and one way in. The main entry point
  // is refused because it imports the deprecated RouterTestingModule; a spec
  // that renders a component has no use for TestBed or the router's harness.
  {
    files: ['packages/client/src/**/*.spec.ts', 'packages/client/src/app/testing/**/*.ts'],
    extends: [testingLibrary.configs['flat/angular']],
    rules: {
      'no-restricted-imports': ['error', { paths: [...testingImports, testBedImport] }],
    },
  },
  // A service has nothing to render, so its spec injects it through TestBed,
  // which Testing Library has no replacement for.
  {
    files: ['packages/client/src/app/{app,game,hub,session,updates}.spec.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: testingImports }],
    },
  },

  // GraphQL: the committed schema and the client's operations, parsed with
  // one configuration, because the plugin keeps the first it is given for
  // every file after; the operations rules read the schema and the sibling
  // documents from it.
  {
    files: ['**/*.graphql'],
    languageOptions: {
      parser: graphql.parser,
      parserOptions: { graphQLConfig: { schema: 'packages/hub/schema.graphql', documents: 'packages/client/src/app/graphql/*.graphql' } },
    },
    plugins: { '@graphql-eslint': graphql },
  },

  // The committed schema, printed from the Pothos builder (rule 11), under
  // every schema rule (docs/standards/graphql.md).
  {
    files: ['packages/hub/schema.graphql'],
    rules: {
      ...graphql.configs['flat/schema-all'].rules,
      // One input object per mutation, named for it (graphql.md, rule 5). The
      // case-sensitive check wants the type named exactly `<field>Input`, in
      // camelCase, which naming-convention's PascalCase for types contradicts.
      '@graphql-eslint/input-name': ['error', { checkInputType: true, caseSensitiveInputType: false }],
      // Relay's convention, `id: ID!` on every object type. The API's value
      // types (Reward, Holding, UnitStats) have no identity, and its ids are
      // strings keyed by the hub, not global ids.
      '@graphql-eslint/strict-id-in-types': 'off',
      // Relay's `query: Query` field on every mutation payload, for
      // refetching through it; the client reads the player again instead.
      '@graphql-eslint/require-field-of-type-query-in-mutation-result': 'off',
      // The all tier forbids a Mutation root; the API has mutations by design.
      '@graphql-eslint/no-root-type': 'off',
      // The file is printed by Pothos, so its order is the printer's.
      '@graphql-eslint/alphabetize': 'off',
    },
  },

  // The client's operations, one definition per file with the fragments it
  // imports (codegen.mjs), under every operations rule and validated against
  // the committed schema, so a document the hub would refuse fails lint
  // (docs/standards/graphql.md, rule 1).
  {
    files: ['packages/client/src/app/graphql/*.graphql'],
    rules: {
      ...graphql.configs['flat/operations-all'].rules,
      // A fragment names the shape a view type derives from
      // (docs/standards/angular.md, rule 5), whether one operation spreads
      // it or three.
      '@graphql-eslint/no-one-place-fragments': 'off',
    },
  },
);
