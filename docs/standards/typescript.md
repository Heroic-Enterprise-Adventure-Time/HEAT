# TypeScript and Node

Standards for every TypeScript package in this repository: the engine, the hub (a Lambda function, decision 0012), the Angular client, and the tooling around them. The client's own rules, its versions, tsconfig, dev server and build among them, are `docs/standards/angular.md`. The detail of a rule, the whole of one written here as a single line, what this document holds back and why its rules are as they are, is `docs/standards/typescript-detail.md`, which nothing loads; its opening says when each section is read (decision 0060).

## Rules

### Versions and dependencies

1. **Latest, preferring LTS where it exists.** Node is the current LTS line, pinned by major in `.node-version`, which `fnm`, CI, the bundler's target, the Lambda runtime and `@types/node`'s major all follow; CI's exact release is pinned with its checksum in `.github/actions/node` (decisions 0047 and 0048). Libraries are kept at their latest release, or on their LTS line, because falling behind is a defect to fix, not a state to keep. Dependabot opens the pull requests; a major that cannot be taken yet is held back in the companion and ignored in `.github/dependabot.yml`, in one pull request. How a pin moves is the companion's "Rule 1".
2. **Exact pins, committed lock file.** `package.json` names exact versions, never ranges, and `package-lock.json` is committed. CI installs with `npm ci`, so what runs there is what ran on the laptop.
3. **Install scripts are approved by name.** npm withholds packages' install scripts until they are listed under `allowScripts` in the root `package.json`. A new one is approved with `npm install-scripts approve <package>`, in the pull request that introduces the dependency, and the pull request description says what the script does.
4. **One source of truth for functions and routes.** `manifest.json` at the repository root lists every Lambda with its handler, memory, timeout and routes. The bundler and Terraform read it; nothing declares a function or route anywhere else.

### Language and modules

5. **ES modules only.** Every package is `"type": "module"`. Imports of local files carry the `.js` extension, as Node's ESM resolution requires. The base settings live in `tsconfig.base.json`; a package overrides only what it must, and says why in a comment.
6. **Strict everything.** `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature` and `verbatimModuleSyntax` stay on in `tsconfig.base.json`, and a type error is fixed at its cause. `any` is a last resort and carries a comment. No `!` (lint `no-non-null-assertion`): a value that may be absent is narrowed, or its absence fails with a message through `must(value, what)` from `@heat/engine`, which in source names the invariant the code relies on, so that it fails there and not later as a TypeError. A cast on an indexed read, `items[i] as T`, is the same assertion in another spelling, and lint refuses it (`no-restricted-syntax`). A property of an index signature is read with brackets, `env["HEAT_VERSION"]`, so that a dynamic key looks dynamic.
7. **Shared code is a package, not a Lambda.** Logic the client and the backend both need, above all the engine, is a workspace package that both import. A Lambda never invokes another Lambda to run shared logic.

### Testing

8. **Vitest, in every package, run by `npm test` at the root.** Unit tests need nothing installed; integration tests start their own containers through Testcontainers, so they need Docker and nothing else, on a laptop and on CI alike (decision 0009). Outside Vitest: the browser test of a running stack is Playwright's (decision 0045; `docs/standards/angular.md`, rule 18), and the hooks under `.claude/hooks/`, the scripts under `scripts/` and a package's own build script are tested by `*.test.mjs` files beside them under `node --test`, importing nothing but Node's own modules (`docs/process/best-practices.md`, rule 13). The engine's source is built without Node's types (`tsconfig.build.json`), because the client runs it in a browser; only its tests take them. Where each runs, and what a package's tsconfig covers, is the companion's "Rule 8".
9. **Handlers are tested as functions.** A Lambda handler is exercised by calling it with a synthesized event of the exact shape AWS sends, never through a mocked SDK inside the code under test. What a handler's middleware does is tested the same way, by calling the handler, not by calling the library in its place, so that a test shows the middleware doing it (the review of PR-209).

### The hub

10. **Apollo Server, Pothos code-first, scope-auth for authorization.** Field-level access is declared as scopes on fields and types; a field the caller may not read resolves to null with an error on that field, so such fields are declared nullable.
11. **The printed schema and the client's code generated from it are committed,** by `npm run schema:print` and `npm run codegen`, and CI fails when either is stale: the companion's "Rule 11".

### Bundling

12. **One ESM file per function, with the AWS SDK beside it.** `scripts/bundle.mjs` bundles each function in the manifest with esbuild into `dist/<name>/`, dependencies included but the AWS SDK v3, whose files the bundle loads are copied beside it, because AWS's OpenTelemetry layer instruments the SDK as it is loaded (decision 0055); Terraform zips the directory with its hash, so a code change is a change in the plan (decision 0017). Logs and metrics go through Powertools; tracing is the layer's and the schema's plugin's, and nothing in a function's own code starts the SDK or exports a span. `@middy/core` wraps a handler with `injectLambdaContext` and `logMetrics` only, at `timeoutEarlyInMillis: 0`, so that a function never answers with work still pending (decision 0040). The detail is the companion's "Rule 12".

### The client

13. *Retired: the client's Angular version is `docs/standards/angular.md`, rule 20 (decision 0060, as amended by Issue-428).*
14. *Retired: the client's tsconfig is `docs/standards/angular.md`, rule 21 (decision 0060, as amended by Issue-428).*
15. *Retired: the client's dev server and build are `docs/standards/angular.md`, rule 22 (decision 0060, as amended by Issue-428).*

### Lint

16. **Lint is the floor.** `npm run lint` at the root runs ESLint over every workspace from one flat config, `eslint.config.mjs`, and "Build and test" fails a pull request on a finding, so a change lints clean before review. A convention a lint rule can express is a rule in the config, not prose here; the review skill and the checkup start where lint stops (decision 0033). The rule sets are the published ones at their strictest tier (the companion's "Rule 16"). A rule is turned off, or its option changed, only with a one-line reason in the config that is about the rule, never about the code; one the code cannot meet yet is held back for those files only, by file pattern at the end of the config, naming the issue that removes the hold-back, and is listed under "Held back" in the companion of the standard whose convention it expresses.

### Libraries

17. **A known library over our own.** For a common problem a popular, current library is preferred and adopted whole, exact-pinned and tracked (rules 1 and 2), because the application is built as an enterprise system would be; our own is the exception, where no current library does the job or the need is smaller than the library's cost, and the code says so in a comment. Validation is zod, spelled `import * as z from "zod/mini"` in every package (decision 0039); the data layer is ElectroDB, behind the repository (decision 0041); the browser test is Playwright (decision 0045); a component spec is Angular Testing Library (decision 0044); a span of the hub's own is the OpenTelemetry API's, and a root field's Pothos's tracing plugin's (decision 0055). The utility library is es-toolkit (decision 0036): where it has a named function for what the code does, `range`, `clamp`, `sortBy`, `uniq`, `sum`, `sumBy`, `upperFirst`, `groupBy`, `keyBy`, `mapValues`, that function is used, in source and tests alike, and the standard library where it reads as plainly, `flatMap`, `find`, a spread, `Object.fromEntries` over pairs, a numeric comparator. Not replaced by it: `must` (rule 6), a `Map` or `Set` that is a cache, a registry or a membership test, and a loop that re-reads between attempts. The rest is the companion's "Rule 17".

### Closed sets

18. **A list that enumerates a closed union is checked against it.** An exported list of a union's members, such as `UNIT_TYPES`, `MATERIALS` or `FACILITY_KINDS`, is the one declaration: the list is `as const` and the union `(typeof LIST)[number]`, so a member added to one is in the other. Where the union is declared elsewhere, the list `satisfies` it and a typed assignment beside it fails on a member the list lacks; a list annotated `readonly T[]` checks nothing, and drops a new member from whatever it feeds, the API's enums among them (graphql.md, rule 4). A closed set spelled in more than one place inside a package has one exported list that every other place reads, as `HERO_STATUSES` in the hub's `db/statuses.ts` (the reviews of PR-192 and PR-212). The companion's "Rule 18" lists the others.

### Shared test helpers

19. **A helper shared by a package's test files is written once**, in one module under the package's `test/` that every test file imports, never copied into each, so that it changes in one place; `packages/hub/test/refusal.ts` holds `refusal` and `BAD_USER_INPUT`. The client's module is `src/app/testing/`, which its application build excludes. This covers a block of set-up repeated across test files, named or not (the reviews of PR-192 and PR-214).

### Types over a library's

20. **A type that corrects a library's says the value's true shape, and any cast the library's signature needs stands at the call.** A type bent so that a value passes reads as true everywhere it is used; the cast at the call says once where the library's signature is wrong (the review of PR-214).

### Security fixes no update reaches

21. **An `overrides` entry is the last resort for a security fix no dependency update reaches,** scoped, pinned and held back with an open issue that tracks its release: the companion's "Rule 21" (Issue-316).
22. **A Dependabot alert is dismissed only with a "Held back" entry and an open issue that tracks the release:** the companion's "Rule 22" (the review of PR-236).

### What a build writes for the page

23. **What a build writes for the page is checked on both sides by one list.** A name the page asks a build's output for, a clip in a sprite set's sheet, a set's kind, a ground's files, is one exported list that the build checks its output against and the page reads, and neither side spells it on its own: `GROUNDS` in `packages/client/src/app/ground-sets.ts`, and `SET_CLIPS` and `PACKED_AREAS` in `sprite-sets.ts`, which the art build imports as they are (the reviews of PR-361 and PR-334, Issue-205). The companion's "Rule 23" says what each side does with them.

### What a test helper takes from the source

24. **A value a shared test helper must agree with in the source is exported from the source and imported by the helper, never copied into it,** because a copy goes on driving the page with a value the page no longer uses, with nothing failing: `MAX_FRAME_MS` in `battle-view.ts`, which the specs' frame loop and `runToBlow` in `testing/fake-battle.ts` read (the review of PR-338, Issue-335).

### What a test says it covers

25. **A test that says it covers every member of a content list iterates over that list in the content,** `UNIT_PROFILES.villager.actions` or a location's `recruits`, and does not spell the members again, so that a member added later is tested; a test of some members, named for them, lists the ones it means (the review of PR-347, Issue-341).
26. **A test that says it covers every case of its own file iterates over one list of them,** from which each test takes its case, so that a case added to one test and not to the list does not compile or is not played; a test of some cases, named for them, lists the ones it means (the review of PR-349, Issue-291).

### What a comment says was measured

27. **A comment that states a result over seeds states one that a test asserts,** in the test's terms, and changes in the commit that changes the test; a result measured once and held by no test goes into the decision record or the pull request, with how it was measured (the review of PR-349, Issue-291).

### What a test says it covers, of the schema

28. **A test that says it covers every verb or field of a kind finds them by walking the built schema,** as `packages/hub/test/access.test.ts` does, and compares its cases with what it finds, so that a new one fails the test until it has a case; a list the test writes and compares with itself passes whatever is added (the review of PR-359, Issue-351).

### What a script takes from the source

29. **A value a script under `scripts/` must agree with in a package's source is imported from the file that declares it, never copied,** that file keeping to what Node's type stripping leaves working, as `ground-sets.ts` does for `scripts/icon-set.mjs`; where it cannot be imported, the change that moves the value searches `scripts/` for it (the review of PR-361, Issue-352).

### What a package mirrors from another

30. **A union a package mirrors from another is imported from the package that owns it, by its type's name,** `UnitKind` and not its members, because nothing holds two spellings in two packages together: the client's `FieldUnit` takes its kind from the engine's `UnitKind` (the review of PR-369, Issue-353).

### What a test file takes from the helpers

31. **A content id that a package's shared test helpers name as a constant is read from the helper by every test file,** as `QUARRY_FACE`, `CARAVAN_BACK` and `HIGHCRAG` in the engine's `test/adventure/helpers.ts` are, and a table keyed by every job takes the constants as its keys, so that a rename reaches every test (the review of PR-373). Each constant is checked against its union where it is declared, `satisfies JobId` or `satisfies LocationId`, so that a renamed id fails to compile in the helper and not at run time in a test.
32. **A block of set-up that one test file repeats is a function of that file,** with what differs as its arguments, as `staleFacility(kind, level)` in the hub's `test/start.test.ts` is, so that a fix to the stub is made once (the review of PR-374).

### What a test starts

33. **An image a test starts is named by an exact version and its digest, `name:version@sha256:…`,** in the `FROM` line of a `*.Dockerfile` beside the set-up, which `imageFrom` and `packages/hub/test/images.test.ts` refuse otherwise: the companion's "Rule 33" (Issue-396).
