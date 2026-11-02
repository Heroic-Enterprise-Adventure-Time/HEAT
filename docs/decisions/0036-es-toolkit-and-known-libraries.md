# 0036: es-toolkit names the utility idioms, and a known library is preferred over our own

- **Status:** Decided
- **Date:** 2026-11-02
- **Settles:** Issue-154: what replaces the hand-written utility idioms the review of PR-153 found (a range in sixteen places, a clamp written both ways round, one-key sort comparators, `[...new Set(xs)]`, a sum by `reduce`, a capitalization by `charAt`), and the general rule those idioms were a case of.

## Decision

**es-toolkit is the utility library, a dependency of the engine, the hub and the client, and where it has a named function for what the code does, that function is used.** `range`, `clamp`, `sortBy`, `uniq`, `sum`, `sumBy`, `upperFirst`, `groupBy`, `keyBy` and `mapValues` replace the idioms in source and tests alike; the standard library stays where it reads as plainly on its own: `flatMap`, `find`, a spread, `Object.fromEntries` over pairs, a numeric comparator on numbers. Not replaced: the engine's seeded random, which replay depends on (es-toolkit's `random` is `Math.random`); `must`, which returns the narrowed value where `invariant` only asserts; a `Map` or `Set` that is a cache, a registry or a membership test; and the settle loop in the hub's submit, which re-reads between attempts, which `retry` does not express.

**The general rule, `docs/standards/typescript.md` rule 17: for a common problem, a popular, well-known, current library is preferred over a solution of our own.** It is adopted whole where it fits, as Angular, Apollo, Pothos, Powertools and PixiJS already are, exact-pinned and tracked by Dependabot, and the standards name it so that each idiom has one spelling. Writing our own is the exception, taken when no current library does the job or when what the code needs is smaller than the library's cost, and the code says so in a comment.

The reason is the project's two readers. A function named `clamp` or `uniq` says what it does; the idiom it replaces has to be parsed, and in this code it was written more than one way. For a person, lodash's vocabulary has been the common one for a decade and es-toolkit keeps it, so the names are read without learning; for an agent the case is stronger, because a named call is harder to get wrong than three nested `Math` calls. The cost of a dependency is small under rules 1 and 2 (exact pin, lock file, Dependabot) and es-toolkit's shape, checked on 2026-11-02 from its published package (1.53.1): ES modules with an entry point per function and `sideEffects: false`, so esbuild and the Angular build bundle only the functions imported, and its own type declarations. The one real cost, two spellings for one idiom, is what the rubric in rule 17 removes.

## Considered and not chosen

- **lodash.** The previous standard and the vocabulary es-toolkit keeps; 4.18.1 is current (released 2026, read from the registry on 2026-11-02). Rejected because its package is CommonJS with a single entry point and its types are a separate package, `@types/lodash`; the ES-module build is a second package, `lodash-es`, without types. es-toolkit is the same vocabulary in one TypeScript-first package.
- **remeda.** TypeScript-first, tree-shaken and current (2.58.0), with data-first and data-last forms of each function. Rejected because its vocabulary is its own and is read by fewer people and agents than lodash's; the point of the rule is a name the reader already knows.
- **tiny-invariant, or es-toolkit's `invariant`, in place of `must`.** Both assert a condition and return nothing, so a value the types say may be absent is not narrowed by the call that checks it; tiny-invariant also drops the message in production builds. `must` stays as rule 6 has it.
- **A module of our own named functions.** The code had one, a local `range` in the battle art, and it is the shape the rule rejects: a private vocabulary each reader has to learn, and one that drifts, since a second file writes the idiom again rather than import it.
- **The hand-written idioms (the status quo).** Each correct, each a second read, and the same idiom written more than one way across the packages.

## Where it is described

`docs/standards/typescript.md`, rule 17; the `dependencies` of `packages/engine`, `packages/hub` and `packages/client`.
