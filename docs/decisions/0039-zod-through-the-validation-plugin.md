# 0039: The contract's scalars and zod check every boundary, and the Pothos validation plugin is where zod runs on the API

- **Status:** Decided
- **Date:** 2026-11-03
- **Settles:** Issue-198, from the library review of 2026-11-03: what replaces the hand-written shape checks in the hub's verbs, the hub's reading of its environment and the client's reading of `config.json`. Amends decision 0038's "every identifier is `ID`" for a request id the client makes.

## Decision

**The contract says what its type can say.** `graphql-scalars`, already a dependency, gives `UUID` on `RecruitHeroInput.requestId`, `NonNegativeInt` on `OverrideInput.acceptedAtSimTime`, `PositiveInt` on `BuildFacilityInput.level`, and `JSON`, in place of the hand scalar, so the printed schema shows the constraint and the generated client types follow.

**zod carries the shape a type cannot say, through `@pothos/plugin-validation`.** A party of 1 to `MAX_PARTY` distinct ids, a log of at most `MAX_OVERRIDES` entries, an ability id of at most `MAX_ABILITY_ID` characters and the location `heroesSeenAt` takes are declared on the input fields and arguments in `schema.ts`. `validationError` makes a failure `badInput`, so the answer is the `GraphQLError` with `BAD_USER_INPUT` of `docs/standards/graphql.md` rule 6, and the contract does not change. What needs a read or the party stays in the verb, by rule 14.

**One vocabulary for configuration too.** The hub's environment and the client's `config.json` are zod schemas. The hub still fails at import on a missing variable and names it; the client still records the failure and renders.

**The spelling is `zod/mini`, in the hub and the client alike:** `import * as z from "zod/mini"`, and `z.string().check(z.minLength(1))` rather than `z.string().min(1)`. It is zod's own tree-shakable API over the same core and the same Standard Schema interface. Measured on 2026-11-03 with `npm run build --workspace @heat/client`, the initial bundle is 603.76 kB on `main`, 1.03 MB with `import { z } from "zod"`, which is over the 1 MB error budget and fails the build, and 617.58 kB with `zod/mini`: 14 kB against 429 kB. The review's figure of 17.7 kB for zod was wrong by that much. The hub could afford the chained form, but two spellings of one library across two packages is what `docs/standards/typescript.md` rule 17 exists to prevent.

The reason is the owner's weighting of 2026-11-03: the application is built as an enterprise system would be, and a common problem takes the library used there, for what it shows and teaches, not only when the code outgrows it.

### What the libraries do not do, and the code does

Each of these was read from the installed source on 2026-11-03 and has a test through the handler.

- **`UUIDResolver` passes any case and a stray closing brace.** Its pattern makes both braces optional separately, and it returns the value as it came, so `<uuid>}` passes with the brace on it, and upper case stays upper case. This value becomes a hero's id, so a repeat in another case would make a second hero. The issue's shape removed the regex and the `toLowerCase`; the field keeps both in zod, `z.uuid(...).check(z.toLowerCase())`, behind the scalar. The contract says `UUID`; the validator holds one request to one spelling.
- **`NonNegativeIntResolver` and `PositiveIntResolver` read a variable with `parseInt`,** so 1.5 would arrive as 1, `"7abc"` as 7 and `1e21` as 1, where `Int` refuses all three. `builder.ts` refuses a value that is not a safe whole number before the library sees it, through `addScalarType`'s options.
- **The plugin validates before a scope is checked,** whatever the order of the plugins: it maps arguments outside every plugin's wrapper. An anonymous caller with a malformed input is told it is malformed. That says nothing beyond the published schema's shape, and the authorizer has already refused an anonymous request at the gateway (decision 0024).

### What changes on the wire

- **A value a scalar refuses is refused before execution.** Sent as a variable, as the client sends everything, it answers `BAD_USER_INPUT` with HTTP 400, Apollo Server's answer to a variable it cannot coerce, where the hand check answered 200. Written inline in the document, it is `GRAPHQL_VALIDATION_FAILED`, as a bad enum already was. A zod failure stays HTTP 200 with `BAD_USER_INPUT`, since it happens at the field. The client sends none of these, and shows either as an `ApiError`.
- **Malformed input is now answered before a refusal.** A party of five while an adventure is open was `AdventureOpen`; it is `BAD_USER_INPUT`. The check moved ahead of the reads, as rule 14 always said it should be.
- **An operation that names a variable's type names the new one:** `$id: UUID!`, `$level: PositiveInt!`. The client's operations pass one input object and do not change; `scripts/e2e.mjs` and the handler test did. An older client tab still works, because its `$input: RecruitHeroInput!` is unchanged.
- **The message a scalar's refusal carries quotes the value refused,** and the request log's warning carries the message (`docs/standards/graphql.md`, rule 16). It is the one malformed value and no other input; `badInput` already quotes a location or job id the same way.

### Not settled here

The replay bucket's check in `handler.ts` stays a hand check for now, because Issue-199 holds that file; it moves to the same `parseEnv` once that merges.

If the sites gain a Content-Security-Policy (Issue-58), zod probes `new Function` once at load to decide whether it may compile a parser. Under a policy without `unsafe-eval` that probe is caught, and may report a violation; `z.config({ jitless: true })` removes it. Not verified, since no policy exists yet.

## Considered and not chosen

- **valibot.** Smallest, and a Standard Schema library the plugin accepts, at 90M downloads a month against zod's 1.34B. Rejected because the point of the weighting is the library a reader already knows, and `zod/mini` closes the size gap that was valibot's reason.
- **arktype.** 8.9M a month, with its own type-string syntax. Rejected for the same reason, more strongly.
- **envalid for the environment.** A good library for one problem, and a second vocabulary beside zod for the same act of checking a value at a boundary.
- **`@pothos/plugin-zod`.** Pothos's documentation names the validation plugin as the recommended way over it, and it ties the schema to one library.
- **The scalars alone.** They cannot say a list's length, its uniqueness or a known location.
- **The hand checks (the status quo).** Correct, about 40 lines across four files, and invisible in the contract: a reader of `schema.graphql` could not see that a request id is a UUID.
- **The full `zod` API in the hub with `zod/mini` in the client.** Reads better in isolation and is what most examples show; two spellings of one library in one repository is the cost, for a hub that gains nothing from it.

## Where it is described

`docs/standards/graphql.md`, rules 4, 14 and 16; `docs/standards/typescript.md`, rule 17; `docs/standards/angular.md`, rule 7; `packages/hub/src/schema/builder.ts` and `schema.ts`; `packages/hub/src/env.ts`; `packages/client/src/app/config.ts`.
