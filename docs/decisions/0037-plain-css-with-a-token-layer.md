# 0037: Plain CSS with a token layer the layout arithmetic reads

- **Status:** Decided
- **Date:** 2026-11-02
- **Settles:** Issue-186: whether the client's styles stay plain CSS or adopt Sass, what the token layer is, and how the layout arithmetic in TypeScript gets the sizes the stylesheet declares.

## Decision

**The client's styles are plain CSS, with native nesting where it reads better, and no preprocessor without a record that supersedes this one.** Plain CSS was the Angular CLI's default and had never been a recorded choice; it is one now. Custom properties, native nesting and `color-mix()` cover what Sass was adopted for in projects of this shape, and the one thing Sass still adds, mixins, had not been needed in the client's five hundred lines of component-scoped styles. Angular's styling guide defaults to CSS and recommends nothing; Angular Material, the one place Sass would be required, emits its theme as custom properties that plain CSS reads; and the 2025 State of CSS survey puts Sass at about sixty percent of respondents, mostly as installed base. All three were read on 2026-11-02.

**The token layer is a set of custom properties on `:root` in `styles.css`, named for what each is and not for its value**, read by the components with `var()`: the palette, a spacing scale, the type sizes beside the base, the border widths and the page's regions. A color or size used by more than one component is a token; a color of the palette or a step of a scale is declared with its set even where one component reads it; a value belonging to no set and used once stays a literal. The rule is `docs/standards/angular.md`, rule 17.

**The layout arithmetic reads the regions' sizes from the tokens at runtime, and holds no copy.** The page's regions, the header's height, the menu's widths, the menu row's height and the panel's bounds, are declared in `rem` so that they follow the player's font size. `page-layout.ts` takes them as a `LayoutSizes` argument, read from the root element's computed style by `readLayoutSizes` at the root font size, and the camp and the adventure read them again on every resize through the `LAYOUT_SIZES` injection token, which a test replaces. The reason is the one best-practices rule 10 states: a constant in TypeScript that copies a `rem` value is true only at the default font size, and the review of PR-189 found four such copies, each linked to its stylesheet value by nothing but a comment that had already gone stale once.

## Considered and not chosen

- **Sass (SCSS).** Variables, nesting, mixins and partials in one toolchain Angular's CLI supports out of the box. Rejected because every use the client has is covered by plain CSS features browsers ship, a token in Sass is compiled away where a custom property is read at runtime by the arithmetic and by the devtools, and the dependency would be carried for mixins nobody has needed.
- **Keeping the pixel constants with a comment naming their twin.** The candidate rule the review proposed: cheap, and the comment is the weakest link between two values, which is how `panelPx`'s comment had gone stale in the same pull request.
- **Writing the regions in `px`.** Makes the two copies equal by construction and costs nothing at the default font size, but a header that does not grow with the player's font size while its text does is the wrong way round; best-practices rule 10 says the page follows the player's settings.
- **Measuring the header with a `ResizeObserver` instead of reading its token.** Handles the header alone; the rail, the labelled menu, the menu row and the panel's bounds would still be constants, and the mode decision, side by side or stacked, needs those sizes before anything is laid out. Reading the tokens gives all of them, before layout, from the one declaration.

## Where it is described

`docs/standards/angular.md`, rule 17; `docs/process/best-practices.md`, rule 10; `packages/client/src/styles.css`; `packages/client/src/app/camp/page-layout.ts` and `layout-sizes.ts`.
