# 0044: Angular Testing Library for the client's component specs

- **Status:** Decided
- **Date:** 2026-11-04
- **Settles:** Issue-203: how a component spec is written, from the library review of 2026-11-03 (row 21). The review recommended keeping Angular's own harness as current practice; the owner chose Testing Library that day, for what it shows and teaches, under the weighting of `docs/standards/typescript.md`, rule 17.

## Decision

**Every spec that renders a component goes through Angular Testing Library, one style.** It finds things the way a player or a screen reader does and acts the way a player does, so a spec reads the same as one in any other framework's Testing Library project.

**The packages.** `@testing-library/angular`, its peer `@testing-library/dom`, `@testing-library/user-event` for every click and keystroke, and `@testing-library/jest-dom` for the matchers, loaded by `packages/client/src/test-setup.ts` through the unit-test builder's `setupFiles`. `eslint-plugin-testing-library` holds the style at its Angular config, taken whole.

**The zoneless entry point, `@testing-library/angular/zoneless`.** The main entry point imports `RouterTestingModule`, which Angular marks deprecated in favor of `provideRouter`, and the owner asked to steer away from deprecated modules. The zoneless entry has no `routes`, `navigate` or change-detecting `findBy`. So a page is reached by one helper, `renderAt` in `testing/render-at.ts`, which renders an outlet with `provideRouter` and navigates, and the application's own scheduler brings the page up to date, as it does in the browser, because nothing forces change detection after an event. The main entry is refused by lint.

**Queries in Testing Library's published order:** role and name, then label, then visible text, scoped with `within` to the panel, the menu or a named section. No `data-testid` is added. None of the specs needed a CSS selector: `toHaveClass` reads the `unbuilt` class, and a decorative icon has the role `presentation`. A list is found by its name, so the lists the specs read gained an `aria-labelledby` on their heading or an `aria-label`, which is the one change to the application and which a screen reader reads too.

**One `userEvent.setup()` instance per test, which the library recommends over its direct calls, and exact text stays exact.** Both were candidate rules from the review of PR-227, which the owner accepted with the list's name; the review also found that the first rewrite had lost three checks, which the specs now hold again.

**A service keeps `TestBed`.** Testing Library has no way to test what has nothing to render: its API is `render`, `screen`, `within`, `waitFor`, `waitForElementToBeRemoved` and configuration. `Game`, `Hub`, `Session` and `Updates`, and in `app.spec` the guard and the initializers, inject through `TestBed`, which is what `render` calls underneath. This narrows the issue's "no `TestBed` import left": the owner's question on 2026-11-04 was whether the one library covers every unit test, and it covers every spec that renders a component. Lint refuses `TestBed` in every spec but those.

**Shared test code is under `src/app/testing/`**, one file per thing, excluded from the application's build: `renderAt`, the session fake, the camp scene that draws nothing, the layout sizes, `textsOf`, and the queries for the page's panel, menu and named lists in `page.ts`. A fake one spec uses stays in that spec, so the three `fakeGame`s, which differ, stay where they are.

## Considered and not chosen

- **Angular's own harness, `TestBed` with `provideRouter` and `RouterTestingHarness` (the status quo).** Angular's current practice, no dependency, and what the review recommended keeping. A spec found things by CSS class, `page.querySelector('.recruits li button')`, which says nothing about what the player sees and passes with a control no one could name. Rejected by the owner, for the shared vocabulary.
- **The main entry point with `render`'s `routes` option.** The agent's first recommendation, because it needs no helper of our own, and it ran. It brings the deprecated module in, and a change of Angular's could remove it from under the specs.
- **Keeping CSS selectors where a role is awkward.** Expected for two cases, and neither turned out to need one.
- **`data-testid`.** Testing Library's own last resort, since the player cannot perceive one; nothing here reached it.
- **Picking a list by its index among the panel's lists.** The first rewrite did this, and needed no template change. A new list above it shifts the index, and the name is what a screen reader has anyway.

## Facts checked

- `@testing-library/angular` 19.6.0, read from its package on 2026-11-04: the README documents `/zoneless` as "a dedicated slim entry point" for zoneless applications, with a migration schematic; the source of the main entry imports `RouterTestingModule`, and `@angular/router`'s types mark that module deprecated; the `/zoneless` source does not import it.
- The unknown of the issue, whether the library, whose documentation names Jest, runs under Vitest through `@angular/build:unit-test` with jsdom and zoneless Angular 22: it does, with no change to the builder; `zone.js` absent and `NgZone` a no-op were checked in a probe that exercised a routed component, clicks, typing and a second navigation through both entry points.
- That the rewrite still catches defects: with the `unbuilt` class bound to the wrong level and `role="alert"` removed from the job panel's refusal, the matching specs failed, four in all. After the review's threads, four more were tried together: Home's sign-in gate removed, the queued action's line removed, a digit added to a job's reward, and a list's label dropped; the matching specs failed, five in all.
- That lint holds the shape: a spec importing `TestBed`, `RouterTestingHarness` and the main entry point, and calling `container.querySelector`, drew five errors.
- The published query priority: [testing-library.com/docs/queries/about](https://testing-library.com/docs/queries/about/). No official Angular layout for shared test code was found; [Angular's component testing guide](https://angular.dev/guide/testing/components-scenarios) names no folder.

## Where it is described

`docs/standards/angular.md`, rule 15; `docs/standards/typescript.md`, rules 17 and 19; `eslint.config.mjs`; `packages/client/src/app/testing/`.
