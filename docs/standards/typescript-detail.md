# TypeScript: the detail

The detail behind `docs/standards/typescript.md`: what its rules need when their kind of work is done, not at a session's start, the whole of the rules it writes as a single line, what it holds back and why its rules are as they are. Its rules are that document's, by their numbers there; each section here is named for the rule it serves (decision 0060, as amended by Issue-428).

Nothing loads this file. It is read by section when the work names it (`docs/process/sessions.md`, rule 18), and whole by the review skill and the checkup: "Rule 1" and "Held back" when a dependency or a pin is added, updated or overridden, a Dependabot pull request or alert is handled, or the checkup tests the release conditions; "Rule 8" when a test or its runner is added outside a package's specs; "Rule 11" when the schema or an operation changes; "Rule 12" when `scripts/bundle.mjs`, a handler's wrapping or its logging changes; "Rule 16" when `eslint.config.mjs` changes or a lint update goes red; "Rule 17" when a library is added or one is weighed against code of our own; "Rule 18" when a closed set is added; "Rules 21 and 22" when an `overrides` entry is added or removed or an alert is dismissed; "Rule 23" when the art build or what the page reads of it changes; "Rule 33" when a test starts a container; "Why" when a rule's reason is in doubt.

## Rule 1: how a pin moves

The Lambda runtime is `nodejs<major>.x`, in Terraform, and `@types/node`'s major is the one Dependabot leaves alone, so that it follows `.node-version`. `.github/actions/node` refuses an unpinned major. A new major's pin lands on `main` before the move, because a plan runs `main`'s copy of the action (decisions 0047 and 0048; `docs/process/best-practices.md`, rule 14). The pin moves to the line's latest patch in a commit of its own, in a pull request of versions and pins. A major that cannot be taken is listed under "Held back" below, with the reason and what releases it, and ignored in `.github/dependabot.yml` in the same pull request.

## Rule 6: `must`

`must` is one function, `packages/engine/src/must.ts`, exported from `@heat/engine`, the package every other package imports (rule 7), and used by every package's source and tests; the hub's resolvers narrow the caller with `callerId` instead. The invariant it names in source is one such as a Map entry just written or an index a loop keeps in range. Brackets on an index signature are what `noPropertyAccessFromIndexSignature` enforces.

## Rule 8: where each test runs

The Playwright test runs from the workflows after the apply, not from `npm test`. The hooks' and the scripts' tests run through `npm run test:hooks` and `npm run test:scripts`, which `npm test` runs first; they need nothing installed, because a script that a job runs under a role may import nothing but Node's own modules. A package's own build script is tested the same way, beside it: the client's art packer by `packages/client/scripts/pack-art.test.mjs`, which the client's `npm test` runs before its specs, because Angular's test builder takes only the application's specs. A package's `tsconfig.json` covers its tests and its `vitest.config.ts` as well as its source, so `npm run typecheck` and the typed lint (rule 16) see them; a package that emits, the engine, builds from `tsconfig.build.json`, which narrows that to `src`.

## Rule 11: the printed schema and the generated client

`npm run schema:print` writes `packages/hub/schema.graphql` from the Pothos builder; CI fails if the committed file is stale. Every pull request that changes the API therefore shows the change as a schema diff. `npm run codegen` then generates the client's operations and types from that file with GraphQL Code Generator's client preset (`codegen.mjs` at the root), into `packages/client/src/app/graphql/generated/`, committed too and checked current by CI the same way, so the client never reads a running hub to build and the same pull request shows the client's types changing beside the schema (`docs/standards/angular.md`, rule 5).

## Rule 12: the bundle

The bundle targets the Node major in `.node-version`, Powertools among the dependencies it includes. The SDK's files, of `@aws-sdk` and `@smithy`, are those the bundle's imports load, traced by `@vercel/nft` and copied beside the file as `dist/<name>/node_modules` from what the lock file installed: the function's own copy, never the runtime's. Terraform passes the zipped directory to the function with its hash. Logging goes through the Powertools logger as JSON lines and metrics through its metrics as embedded metric format lines in the log, both at one version, configured by the environment variables Terraform sets on the function. The function's span and each SDK call's are the layer's; a root field's is the schema's tracing plugin (rule 17). The function's own handler is innermost under middy's two middlewares; what middy's other middlewares do, Apollo's plugins and the integration's own option already do for the hub.

## Rule 16: the rule sets

The rule sets are the published ones, at their strictest tier: `@eslint/js` recommended for plain JavaScript; typescript-eslint's `strictTypeChecked` and `stylisticTypeChecked`, with type information from each package's `tsconfig.json`, for every TypeScript file; angular-eslint's `all` tier for the client's components and for its templates, in files and inline alike, which holds its accessibility rules; `eslint-plugin-playwright`'s recommended config for the browser test, with `no-raw-locators` on (`docs/standards/angular.md`, rule 18); `@graphql-eslint`'s `all` tier for the committed schema; `eslint-plugin-testing-library`'s Angular config for the client's specs (`docs/standards/angular.md`, rule 15); and `no-console` on the hub's source, whose logging has one path (`docs/standards/graphql.md`, rule 16).

Imports in every JavaScript and TypeScript file are grouped and sorted by `perfectionist/sort-imports`, Node built-ins, packages, `@heat/*`, local files, a blank line between groups, and the names inside their braces by `perfectionist/sort-named-imports`, with one declaration per module, types inline (`no-duplicate-imports`), so a new import has one place to go and the fixer puts it there (Issue-183).

An `all` tier is taken whole, with the rules that contradict a convention of ours named off beside their reason, as the typescript-eslint tiers are. The rules named off or changed, each for a reason about the rule: `restrict-template-expressions` allows a number; `non-nullable-type-assertion-style` is off because it writes the `!` that rule 6 forbids; `no-unused-vars` takes the `_` prefix as deliberate; `no-extraneous-class` allows a decorated class in the client, because the framework instantiates a component from its decorator and one whose whole content is its template has no members. The client's and the schema's own exceptions stand in the config with theirs (`docs/standards/angular.md`, rules 3 and 13; `docs/standards/graphql.md`, rules 1 and 6).

The stylesheets have a floor of their own, stylelint, from `stylelint.config.mjs` at the root (`docs/standards/angular.md`, rule 17; decision 0061): the published `stylelint-config-standard`, taken whole, with no rule named off, and over it the rules that keep colour and `px` in `packages/client/src/styles.css`.

The strict tier is not semver-stable: a typescript-eslint minor may add a rule, and the Dependabot pull request that brings it goes red until the finding is fixed on that branch, which is the floor doing its job.

The model-driven review that starts where lint stops is the review skill on a pull request (`docs/runbooks/review-change.md`) and the checkup skill at a pause (`docs/runbooks/checkup.md`).

## Rule 17: the libraries named, and those weighed and kept

Angular, Apollo, Pothos, Powertools and PixiJS are adopted whole, and named in the standards so that each idiom has one spelling. The weighting is the owner's: a common problem takes the library an enterprise system would use, for what it shows and teaches, not only when the code outgrows our own. ElectroDB is `docs/standards/graphql.md`, rule 17; Angular Testing Library is `docs/standards/angular.md`, rule 15. es-toolkit is a dependency of the engine, the hub and the client. `must` is kept beside it because it returns the narrowed value where `invariant` only asserts, and a loop that re-reads between attempts because `retry` does not express it.

The zod spelling is `zod/mini` because the chained API adds 429 kB to the client's first page where this one adds 14 kB (decision 0039). The files a function needs beside its bundle are traced by `@vercel/nft` (rule 12). The client's art build reads and writes pixels with sharp and places a set's frames on its sheet with maxrects-packer (`docs/standards/angular.md`, rule 22; decision 0028 as amended by Issue-205); `scripts/icon-set.mjs` draws its sheet of candidates with sharp too, which is why sharp is also a development dependency of the root, at the client's version.

Weighed against a library and kept, each for its reason:

- the engine's seeded random, because replay would then depend on a library's stream staying bit-identical across releases (and es-toolkit's `random` is `Math.random`);
- DataLoader, until a field resolves a list over N parents, which build order step 3 brings;
- the Powertools idempotency utility, which raises on an in-flight duplicate where the hub answers the work as it is (`docs/standards/graphql.md`, rule 7);
- a JWT library, because the authorizer has already verified the token (`docs/standards/graphql.md`, rule 12);
- the Terraform registry modules, because the project's own module library carries the guardrail reasoning per argument (`docs/standards/terraform.md`);
- the plan-comment and release actions, because the scripts redact the account id and check the saved plan.

## Rule 18: the closed sets

The lists that are their union's one declaration include `UNIT_TYPES`, `MATERIALS`, `GATHERING_TRAITS`, `FACILITY_KINDS`, `MONSTER_TYPES`, `RESOURCE_TYPES`, `STAGE_ENDINGS`, `ADVENTURE_OUTCOMES` and `UNLOCK_IDS`. `StageKind` is declared from `Stage`, so its list `satisfies` it. A list annotated `readonly T[]` compiles when a member is added to the union alone. The one exported list replaces every other spelling, an unexported inline list included: `HERO_STATUSES` feeds the entity, the union and the API's enum. Rule 23 is the same rule from a build script to the TypeScript it feeds; rule 30 reaches across packages.

## Rules 21 and 22: overrides and dismissed alerts

Rule 21 in full: an `overrides` entry is the last resort for a security fix no dependency update reaches. It is scoped under the package that holds the vulnerable range, pinned exactly (rule 2), and listed under "Held back" below (rule 1) with what releases it and an open issue that tracks the release; it leaves `package.json` and that list in the same pull request. Where an override takes effect only once a nested entry is dropped from the lock file, that entry alone is dropped: dropping its siblings let npm hoist them past the parent's caps (Issue-316; the review of PR-236).

Rule 22 in full: a Dependabot alert is dismissed only with a "Held back" entry below that gives the reason and what releases it, and an open issue that tracks the release. Rule 1's ignore in `.github/dependabot.yml` is for a major of a direct dependency, and does not apply (the review of PR-236).

## Rule 23: what each side does with the list

The art build refuses a ground set without the files the page asks of it, and a sprite set without one of the clips of its kind. `SET_CLIPS` is the clips of each kind of set, `PACKED_AREAS` the kind each area under `art/` holds. The art build imports `sprite-sets.ts` as it is, Node stripping its types, so the file keeps to what stripping leaves working. The page's `loadSpriteSet` takes a clip's name and a set's path only as the list types them, so a scene that asks for a clip the build does not check does not compile. Rule 18 is the same rule inside a package.

How rules 24 to 31 relate: rule 19 says where a shared helper lives, rule 24 where its numbers come from and rule 31 where a test file's ids come from; rules 25, 26 and 28 say a test that claims every case iterates over the content's list, its own file's list and the built schema; rule 29 says of a script what rule 24 says of a helper and `docs/README.md`, rule 5, of a document; rule 27 holds a comment to what a test asserts, as `docs/README.md`, rules 5 and 6, hold a document to what is true.

## Rule 33: an image's reference

"Build and test" pulls and runs the image, so a moved tag would run code nobody reviewed (`docs/process/best-practices.md`, rule 14). The reference is the `FROM` line of a `*.Dockerfile` beside the set-up, as `packages/hub/test/setup/dynamodb.Dockerfile` is, because Dependabot's `docker` ecosystem moves a version and digest there together and reads no string in TypeScript; the digest is the registry's, read when the version is taken. `imageFrom` (`packages/hub/test/setup/image.ts`) reads it and refuses a reference without a digest, and `packages/hub/test/images.test.ts` refuses a `GenericContainer(` call under `packages/` that does not use `imageFrom`, and a `*.Dockerfile` Dependabot does not watch (Issue-396).

## Held back

A lint rule not yet met is listed in the companion of the standard whose convention it expresses (rule 16): none, for `typescript.md` or `graphql.md`, since Issue-155.

Majors not taken, each with the reason and what releases it (rule 1). Checked 2026-11-02.

- **graphql 17.** Apollo Server 5 declares graphql `^16.11.0` as its peer dependency; Pothos accepts 16 or 17. Released when Apollo Server accepts 17.
- **TypeScript 7.** The latest tag; 6.0.3 is pinned. Angular 22 accepts `>=6.0 <6.1` (`docs/standards/angular.md`, rule 20), so 7 waits for an Angular release that accepts it, then a trial on a branch showing that Pothos, Vitest and the Angular tooling compile and test under it.
- **`@opentelemetry/api` 1.10, with `@opentelemetry/sdk-trace` 3 and `@opentelemetry/context-async-hooks` 3.** A minor, not a major, and held all the same: 1.9.1 is pinned, the version AWS's OpenTelemetry layer carries, because the API ignores a provider registered by an older minor, so a newer copy in the bundle would record nothing and say nothing (decision 0055). The SDK the hub's tracing test registers is `@opentelemetry/sdk-trace-base` 2.12.0, which npm marks deprecated in favour of `@opentelemetry/sdk-trace`, whose 3.x needs the API at 1.10; the context manager is the 2.x that goes with it. Released when the layer `terraform/modules/environment/functions.tf` names carries the API at 1.10 or later: the layer's version, the API, the test's SDK and its context manager move in one pull request, and the checkup reads the layer's latest version at every pause (`docs/runbooks/checkup.md`, rule 12). Checked 2026-11-17.

Security fixes that no dependency update reaches, each with what releases it (rules 21 and 22). Issue-238 tracks both. Checked 2026-11-27.

- **`@graphql-tools/utils`, overridden under `@apollo/server`.** Apollo Server 5.5.2, the latest, declares `^10.9.1 || ^11.0.0 || >=12.0.0 <12.0.2`, and npm nested 12.0.1 under it, in the hub's bundle (Dependabot alert 8). Apollo's changelog says the cap keeps `@whatwg-node/promise-helpers` 2 off Node 20; HEAT runs Node 26. The override gives Apollo the same 12.1.0 as the rest of the tree; Apollo keeps its own capped `@graphql-tools/schema` and `merge`, which accept it. Nothing in the bundle calls the advisory's `mergeIncrementalResult`; the override removes the vulnerable copy all the same, so an Apollo update that starts calling it is covered. The override reaches every edge in Apollo's subtree, whatever range a later Apollo declares, so `npm ci` reports no conflict: each `@apollo/server` update is checked against `npm view @apollo/server dependencies`, and one that needs a later `@graphql-tools/utils` moves the pin with it, at or above 12.0.2. It also puts `@whatwg-node/promise-helpers` 2, which requires Node 22.15 or later, in the hub's bundle, so it holds only while the Lambda runtime and the bundle's target, both from `.node-version`, stay there. Released when Apollo Server accepts 12.0.2 or later: the override leaves `package.json` and this list in the same pull request.
- **`minimatch` from 7.0.0 below 11.0.1, alert dismissed.** `graphql-config` 6.0.0 requires `^10.0.0`, `glob` 10.5.0, under Testcontainers, requires `^9.0.4`, and the pinned typescript-eslint 8.72.2's `typescript-estree` requires `^10.2.2`, which its 8.74.0 already raises to `^11.0.1` (Dependabot alert 24). An override would cross majors against those ranges. The advisory needs an attacker to control the glob pattern, and every copy is a development dependency, whose patterns are this repository's and its tools'. Released when those packages accept 11.0.1 or later; a dismissed alert does not say when, so the checkup tests this condition (`docs/runbooks/checkup.md`, rule 5).

## Why

Latest with LTS preferred is the owner's standing policy for every tool and library: a project that exists to show current practice should run on current versions, and the cost of staying current in small steps is far below the cost of a large jump later. Exact pins and the lock file make the laptop and CI identical, which decision 0009 depends on. The install-script approval is npm's own control since 11.19; recording approvals in the repository turns a per-machine prompt into a reviewed decision. The manifest exists because the bundler and Terraform would otherwise each hold a copy of the same routes and drift. Committing the printed schema is how a code-first project keeps schema-first's one real advantage, a reviewable contract.

Lint is the first layer of the review programme (Issues 144 to 147): the one layer that is deterministic and free, so that the model-driven layers spend nothing on what a linter knows. The strictest published tier was the owner's call, for a codebase meant to show current practice, and its cost was measured before it was taken; most of that cost was non-null assertions in tests, which is why rule 6 says "not used". The client's and the schema's rule sets are the `all` tiers because the owner weights accepted practice over the code as it is (Issue-145), and a rule named off is named for a convention this project holds against the rule, not for the code's convenience.

Angular releases its packages as one set and names the TypeScript versions it accepts, so its packages are pinned to one version and moved as one, and the repository's one TypeScript pin follows Angular's window (Issue-45; `docs/standards/angular.md`, rule 20).

Rule 17's utility library (the review of PR-153, Issue-149; Issue-154) is there because an idiom written by hand, each one correct, is a second read to see what it means. The project has two readers, a person and a coding agent, and a named function serves both: lodash's vocabulary, which es-toolkit keeps, is read without learning, and a named call is harder to get wrong than three nested `Math` calls. Under rules 1 and 2 and es-toolkit's per-function modules the dependency costs little, and the one real cost, two spellings for one idiom, is what the rubric in the rule removes. What was weighed, lodash, remeda, tiny-invariant and the idioms as they were, is decision 0036.

Rule 8's tests of the hooks and the scripts run under Node's own runner because what they test lives in no package and needs none (Issue-328, the review of PR-333).

The rules are loaded in three tiers (decision 0060, as amended by Issue-428): a rule a session could break before anything catches it is loaded as its imperative and a clause of reason; a rule a test or lint holds, or one bound to a kind of work that names this file when it starts, is loaded as one line; and this file, which nothing loads, holds the rest.
