# TypeScript dependencies and tooling

The detail behind `docs/standards/typescript.md`'s rules on dependencies and lint, and the list of what that document holds back. Its rules are that document's, by their numbers there; each section here is named for the rule it serves, and adds what the rule needs when its kind of work is done, not at a session's start.

Nothing loads this file. It is read by section when the work names it (`docs/process/sessions.md`, rule 18): "Held back" when a dependency is added, updated or overridden, a Dependabot pull request or alert is handled, or the checkup tests the release conditions; "Rule 16" when `eslint.config.mjs` changes or a lint update goes red; "Rule 17" when a library is added or one is weighed against code of our own; "Rule 21" when an `overrides` entry is added or removed (Issue-375).

## Rule 16: the rule sets

The rule sets are the published ones, at their strictest tier: `@eslint/js` recommended for plain JavaScript; typescript-eslint's `strictTypeChecked` and `stylisticTypeChecked`, with type information from each package's `tsconfig.json`, for every TypeScript file; angular-eslint's `all` tier for the client's components and for its templates, in files and inline alike, which holds its accessibility rules; `eslint-plugin-playwright`'s recommended config for the browser test, with `no-raw-locators` on (`docs/standards/angular.md`, rule 18); `@graphql-eslint`'s `all` tier for the committed schema; `eslint-plugin-testing-library`'s Angular config for the client's specs (`docs/standards/angular.md`, rule 15); and `no-console` on the hub's source, whose logging has one path (`docs/standards/graphql.md`, rule 16).

Imports in every JavaScript and TypeScript file are grouped and sorted by `perfectionist/sort-imports`, Node built-ins, packages, `@heat/*`, local files, a blank line between groups, and the names inside their braces by `perfectionist/sort-named-imports`, with one declaration per module, types inline (`no-duplicate-imports`), so a new import has one place to go and the fixer puts it there (Issue-183).

An `all` tier is taken whole, with the rules that contradict a convention of ours named off beside their reason, as the typescript-eslint tiers are. The rules named off or changed, each for a reason about the rule: `restrict-template-expressions` allows a number; `non-nullable-type-assertion-style` is off because it writes the `!` that rule 6 forbids; `no-unused-vars` takes the `_` prefix as deliberate; `no-extraneous-class` allows a decorated class in the client, because the framework instantiates a component from its decorator and one whose whole content is its template has no members. The client's and the schema's own exceptions stand in the config with theirs (`docs/standards/angular.md`, rules 3 and 13; `docs/standards/graphql.md`, rules 1 and 6).

The stylesheets have a floor of their own, stylelint, from `stylelint.config.mjs` at the root (`docs/standards/angular.md`, rule 17; decision 0061): the published `stylelint-config-standard`, taken whole, with no rule named off, and over it the rules that keep colour and `px` in `packages/client/src/styles.css`.

The strict tier is not semver-stable: a typescript-eslint minor may add a rule, and the Dependabot pull request that brings it goes red until the finding is fixed on that branch, which is the floor doing its job.

## Rule 17: the libraries named, and those weighed and kept

The zod spelling is `zod/mini` because the chained API adds 429 kB to the client's first page where this one adds 14 kB (decision 0039). The files a function needs beside its bundle are traced by `@vercel/nft` (rule 12). The client's art build reads and writes pixels with sharp and places a set's frames on its sheet with maxrects-packer (rule 15; decision 0028 as amended by Issue-205); `scripts/icon-set.mjs` draws its sheet of candidates with sharp too, which is why sharp is also a development dependency of the root, at the client's version.

Weighed against a library and kept, each for its reason:

- the engine's seeded random, because replay would then depend on a library's stream staying bit-identical across releases (and es-toolkit's `random` is `Math.random`);
- DataLoader, until a field resolves a list over N parents, which build order step 3 brings;
- the Powertools idempotency utility, which raises on an in-flight duplicate where the hub answers the work as it is (`docs/standards/graphql.md`, rule 7);
- a JWT library, because the authorizer has already verified the token (`docs/standards/graphql.md`, rule 12);
- the Terraform registry modules, because the project's own module library carries the guardrail reasoning per argument (`docs/standards/terraform.md`);
- the plan-comment and release actions, because the scripts redact the account id and check the saved plan.

## Rule 21: the lock file

Where an override takes effect only once a nested entry is dropped from the lock file, that entry alone is dropped: dropping its siblings let npm hoist them past the parent's caps (Issue-316; the review of PR-236).

## Held back

Majors not taken, each with the reason and what releases it (rule 1). Checked 2026-11-02.

- **graphql 17.** Apollo Server 5 declares graphql `^16.11.0` as its peer dependency; Pothos accepts 16 or 17. Released when Apollo Server accepts 17.
- **Node 26.** Node 24 is the LTS line and 26 is Current. Released when 26 enters LTS, as rule 1 says.
- **TypeScript 7.** The latest tag; 6.0.3 is pinned. Angular 22 accepts `>=6.0 <6.1` (rule 13), so 7 waits for an Angular release that accepts it, then a trial on a branch showing that Pothos, Vitest and the Angular tooling compile and test under it.
- **`@opentelemetry/api` 1.10, with `@opentelemetry/sdk-trace` 3 and `@opentelemetry/context-async-hooks` 3.** A minor, not a major, and held all the same: 1.9.1 is pinned, the version AWS's OpenTelemetry layer carries, because the API ignores a provider registered by an older minor, so a newer copy in the bundle would record nothing and say nothing (decision 0055). The SDK the hub's tracing test registers is `@opentelemetry/sdk-trace-base` 2.12.0, which npm marks deprecated in favour of `@opentelemetry/sdk-trace`, whose 3.x needs the API at 1.10; the context manager is the 2.x that goes with it. Released when the layer `terraform/modules/environment/functions.tf` names carries the API at 1.10 or later: the layer's version, the API, the test's SDK and its context manager move in one pull request, and the checkup reads the layer's latest version at every pause (`docs/runbooks/checkup.md`, rule 12). Checked 2026-11-17.

Security fixes that no dependency update reaches, each with what releases it (rules 21 and 22). Issue-238 tracks all three. Checked 2026-11-17.

- **`@graphql-tools/utils`, overridden under `@graphql-eslint/eslint-plugin`.** The plugin's latest release, 4.4.2, requires `^10.0.0`, and every 10.x is vulnerable (Dependabot alert 1, and alert 8 until Issue-316; fixed in 12.0.2). The root's `overrides` gives the plugin the 12.1.0 the rest of the tree already resolves. The plugin's lint rules pass on it and still fail a broken schema. The override reaches every edge in the plugin's subtree, so an update there that needs a later 12.x fails or nests on its own Dependabot pull request, and the pin moves with it. Released when the plugin accepts 12.0.2 or later: the override leaves `package.json` and this list in the same pull request.
- **`@graphql-tools/utils`, overridden under `@apollo/server`.** Apollo Server 5.5.2, the latest, declares `^10.9.1 || ^11.0.0 || >=12.0.0 <12.0.2`, and npm nested 12.0.1 under it, in the hub's bundle (Dependabot alert 8). Apollo's changelog says the cap keeps `@whatwg-node/promise-helpers` 2 off Node 20; HEAT runs Node 24. The override gives Apollo the same 12.1.0 as the rest of the tree; Apollo keeps its own capped `@graphql-tools/schema` and `merge`, which accept it. Nothing in the bundle calls the advisory's `mergeIncrementalResult`; the override removes the vulnerable copy all the same, so an Apollo update that starts calling it is covered. The override reaches every edge in Apollo's subtree, whatever range a later Apollo declares, so `npm ci` reports no conflict: each `@apollo/server` update is checked against `npm view @apollo/server dependencies`, and one that needs a later `@graphql-tools/utils` moves the pin with it, at or above 12.0.2. It also puts `@whatwg-node/promise-helpers` 2, which requires Node 22.15 or later, in the hub's bundle, so it holds only while the Lambda runtime and the bundle's target, both from `.node-version`, stay there. Released when Apollo Server accepts 12.0.2 or later: the override leaves `package.json` and this list in the same pull request.
- **`minimatch` from 7.0.0 below 11.0.1, alert dismissed.** ESLint's packages, typescript-eslint and `graphql-config` require `^10`, and `glob` 10, under Testcontainers, requires `^9` (Dependabot alert 24). An override would cross majors against those ranges. The advisory needs an attacker to control the glob pattern, and every copy is a development dependency, whose patterns are this repository's and its tools'. Released when those packages accept 11.0.1 or later; a dismissed alert does not say when, so the checkup tests this condition (`docs/runbooks/checkup.md`, rule 5).
