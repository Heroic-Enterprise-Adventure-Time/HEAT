/**
 * A stylesheet imported as its text, `with { loader: 'text' }`, which
 * `@angular/build` hands over as a string: how a spec reads the tokens of
 * styles.css (`style-tokens.ts`). Declared here, under `testing/`, so that
 * only the specs' tsconfig sees it and the application cannot import one.
 */
declare module '*.css' {
  const text: string;
  export default text;
}
