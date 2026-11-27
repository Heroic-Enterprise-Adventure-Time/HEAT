# How the standards got here

The dated accounts behind the rules of the standards in this directory: what happened, in which review or session, and what was found or measured. Each standard says what to do, with a clause of reason and a reference, an issue's, a pull request's or a decision's; the account that reference stands for is here, under its standard, and opens with its rule's number, or with "Held back" or "Why".

Nothing loads this file, and no session reads it at its start (`docs/README.md`, rule 17). It is read when a rule's reason is in doubt, or when a rule is about to be changed, by a search for the rule's number under its standard's heading. An account is added here in the pull request that adds or changes the rule, and is not rewritten afterwards.

## typescript.md

Rule 8. The sentence on Node's own runner was added on 2026-11-19 (Issue-328), from the review of PR-333. The hooks' tests had run under `node --test` since Issue-318 while the rule named one test outside Vitest, and the trace report's test was the second of the kind; the rule now says what the code does, and why those tests need no package.

Rule 9. From the review of PR-209, where a test flushed the metrics itself and so no test showed `logMetrics` doing it.

Rule 15. The dev server's sentence was added by Issue-46, not Issue-39 as first written. The initial bundle's warning budget was raised from 500 kB to 750 kB by Issue-156, when Apollo Client, Apollo Angular and `graphql` took the initial bundle from 419 kB to 604 kB. The art step, when it was written down, took about two seconds for 26 sets.

Rule 17. The weighting of a known library over our own is the owner's of 2026-11-03.

Rule 18. From the reviews of PR-192 (Issue-155) and PR-212 (Issue-200).

Rule 19. From the review of PR-192, which found five copies of a shared helper, and of PR-214.

Rule 20. From the review of PR-214, on `RawPage.LastEvaluatedKey`.

Rule 23. From the review of PR-334 (Issue-205), where the clips were spelled in `pack-art.mjs` and again where the scenes asked for them.

Rule 24. A candidate rule from the review of PR-338 (Issue-335), accepted by the owner on 2026-11-20.

Rule 25. A candidate rule from the review of PR-347 (Issue-341), accepted by the owner on 2026-11-23, where the first job's test copied the villager's four abilities and Millbrook's recruits.

Rule 26. A candidate rule from the review of PR-349 (Issue-291), accepted by the owner on 2026-11-23, where the lumber job's test of its time limit said "every party above" and played six of them.

Rule 27. A candidate rule from the review of PR-349 (Issue-291), accepted by the owner on 2026-11-23, where the lumber job's comment said any lone hero falls to two wolves and a lone fighter falls to them on 55 of 124 seeds. `docs/README.md`, rules 5 and 6, held documents to what is true, and nothing held a comment.

Rule 28. A candidate rule from the review of PR-359 (Issue-351), accepted by the owner on 2026-11-24, where the test of every verb that takes a location compared its three names with themselves.

Rule 29. A candidate rule from the review of PR-361 (Issue-352), accepted by the owner on 2026-11-24, where the script held `#4f7f2a` "where each scene makes its canvas" and the change moved that colour into a list and gave it another value.

Rule 30. A candidate rule from the review of PR-369 (Issue-353), accepted by the owner on 2026-11-25: the engine added `cart` to `UnitKind` and the client's field spelled the union again by hand, so only a reader of both packages would have found the second place to add it. Applying the rule found two more copies in the client, the field's outcome and the battle scene's side running on, now `AdventureOutcome` and `Side`.

Rule 31. A candidate rule from the review of PR-373 (Issue-356), accepted by the owner on 2026-11-26: the engine's test helpers named the quarry's and the route back's jobs as constants, and three test files spelled the ids again. Applying the rule converted every job id and Highcrag's id in the engine's tests, the bonus tables of `content.test.ts` among them.

Rule 33. A rule the owner accepted on the checkup of `6df7d6e`, added by Issue-396 on 2026-11-27: the hub's tests started `amazon/dynamodb-local:latest`, so each run of "Build and test" pulled whatever the tag pointed at that day. The reference went into a `FROM` line of a Dockerfile that nothing builds because Dependabot's `docker` ecosystem matches file names by `/dockerfile|containerfile/i` and reads no string in TypeScript, and its file updater moves a tag and a digest together (dependabot-core, read 2026-11-27). The rule went under a heading of its own after rule 32, so that rules 10 to 32 kept the numbers other documents cite.

Held back, `@graphql-tools/utils` overridden under `@apollo/server`. Dependabot alert 8 was reopened on 2026-11-17 by PR-311.

Why. Latest with LTS preferred was stated by the owner as standing policy on 2026-10-14.

Why. The review programme of which lint is the first layer was agreed on 2026-10-23 (Issues 144 to 147). The cost of the strictest tier was measured on `main` that day: 525 findings against 163 for the recommended tier, most of them non-null assertions in tests, which is why rule 6 changed from "a last resort with a comment" to "not used" in the same pull request. Three pull requests paid that cost, one per area, because one would not have been reviewable line by line. The client's and the schema's rule sets moved from the recommended tiers to the `all` tiers on 2026-10-24 (Issue-145), when the owner weighted accepted practice over the code as it was: the `all` tiers cost 35 findings, 25 of them fixed by the fixer, and nine rules named off.

Why. The client's rules were added on 2026-10-17 with the first Angular code (Issue-45). The TypeScript pin moved from 5.9.3 to 6.0.3 for Angular 22; the engine and the hub compiled and tested under 6.0.3 unchanged.

Why. Rule 17's utility library comes from the review of PR-153 (Issue-149) and was adopted by Issue-154 on 2026-11-02: the code wrote by hand what a utility library names, a range in sixteen places, a clamp both ways round, one-key sort comparators, `[...new Set(xs)]`, each correct and each a second read to see what it means.

## angular.md

The document. Written on 2026-10-24 (Issue-145) from the code on `main` and from decisions 0024, 0028 and 0030, with accepted practice stated as the rule and the code's distance from it under "Held back".

Why, the shape rules. Weighting accepted practice over the code as it was is the owner's call of 2026-10-24. The nine findings the `all` tier of angular-eslint raised that the fixer could not fix were four fields out of order, two switches without a default, two images without `ngSrc` and one method call a pipe replaces, fixed in the same pull request.

Rules 4 and 5, the generated client. Decision 0012's shape was reached on 2026-11-02 (Issue-156), which generated the client and replaced `fetch` with Apollo Angular; "Held back" has held nothing since. PR-192 had shipped a defect, a fragment spread on a union with no such member, found only at the stack URL, which validation against the committed schema means cannot recur. The pending state per control replaced a page-wide `busy` flag that disabled unrelated controls.

Rule 6, a wire value passing through. The review of PR-192 found `load()` failing whole on one new enum value.

Rules 4 and 6, the table typed by its closed set and the static files checked at their fetch. Both came from the checkup of 2026-11-09 (Issue-268): an `ENDINGS` table keyed by `string` and a `REFUSALS` table missing a type each fell back to the wire's spelling without a word from the compiler, and rule 4's "nothing else calls `fetch`" was loosened, because the art's JSON is not the hub's and was read with an `as` cast that nothing checked.

Rule 9. The layout arithmetic of Issues 89, 95 and 99 was argued over in numbers, and numbers in a function with a spec are what settled it.

Rule 14. The sentence on a live region is a candidate rule from the review of PR-361 (Issue-352), accepted by the owner on 2026-11-24. It was a comment beside the party's "Carrying" line since the review of PR-345, and the line that tells a new unlock, which comes in with the player's second read after the result is on the page, was written without it.

Rule 15. The test rule, decision 0044, was the owner's call of 2026-11-03; Angular's own harness is what the library review recommended keeping. The zoneless entry point follows from the owner's steer of 2026-11-04 away from deprecated modules.

Rule 17. The pixel constants that copied the tokens were true only at the default font size, which the review of PR-189 found.

Rule 19. Added on 2026-11-24 (Issue-352). The result page first asked the submit's result for the unlocks the run earned, a field the hub gained one pull request earlier: on `dev` the previous deploy already had it, and on `prod`, which had neither, the next release would have left every adventure open across it unsettled until the release after. Decision 0038 met the same limit once and accepted it; nothing said that the next field would meet it too. Rewritten on 2026-11-25 (Issue-355), by the owner's call: the rule of Issue-352 was that a field joins the submit's selection only once every environment's previous deploy has it, and what a result needed from a newer schema was read from an operation the current route alone answers. Issue-355's result needed what a caravan delivered; the agent proposed that second read, and the owner chose the cleaner shape, the fields on the submit's own result, with the break of the previous route said in the pull request. The rule now puts the cleanest shape first and makes the second read the exception.

## graphql.md

The document. It was written on 2026-10-24 (Issue-145) from the code on `main` and from decisions 0012, 0013, 0014, 0023, 0024, 0029 and 0030, with the API shape accepted practice asks for stated as the rule; the code reached that shape on 2026-11-02 (Issue-155, decision 0038).

Rule 6. The shape of errors as data is Apollo's "Errors as data" guide, read on 2026-10-24; what was weighed is decision 0038.

Rule 21. The review of PR-210 (Issue-208) found the list of the `errors` array's codes repeated in four other places.

Rule 23. `Player.name` was named from the token's email until decision 0043.

Rule 25. A candidate rule from the review of PR-346 (Issue-340), accepted by the owner on 2026-11-20. The first test that needed one outcome of a seed the hub issues, a settlement that credits a wolf's hide, which drops half the time, started an adventure for up to thirty players until the engine said one carried hide. It passed, and it said nothing about which seed it had settled.

Rule 26. A candidate rule from the review of PR-347 (Issue-341), accepted by the owner on 2026-11-23.

Rule 27. A candidate rule from the review of PR-359 (Issue-351), accepted by the owner on 2026-11-24, where only a comment in `packages/hub/src/submit.ts` said it.

Rule 28. A candidate rule from the review of PR-359 (Issue-351), accepted by the owner on 2026-11-24, where the check that the player holds a location's unlock was written out three times with a fourth to come (Issue-354).

Rule 29. A candidate rule from the review of PR-371 (Issue-354), accepted by the owner on 2026-11-25, where the resolver of startAdventure passed two undefined arguments to reach the caravan in the request.

Why. The rules for scalars, input objects and result unions were taken on 2026-10-24, when the owner weighted accepted practice over the code as it was: the hub's `GraphQLError` with a code in `extensions` was Apollo's older documented shape and still correct, but a union per mutation puts every refusal into the contract, typed. Both changes, the unions and the two tiers of error, touched the client and the stack test, which is why they were an issue of their own, Issue-155, and not a rubric's pull request. One place for each check (decision 0039) replaced checks written by hand in the verbs, correct and invisible to a reader of the contract, so that they ran after the reads they should have saved, and a test had to reach a verb to see them. Rules checked twice is the shape every transaction took from Issue-81 on. Logging lines and never bodies is the hub's observability module as first written.

## terraform.md

The document. Written on 2026-10-24 (Issue-145) from the roots and modules on `main`.

Rule 17, tflint. The floor gained tflint on 2026-10-24 (Issue-145), when the owner weighted accepted practice over the code as it was. Its first run found four things of two kinds: an unused variable the environment module declared and three roots passed, removed, and an unused data source that exists on purpose, annotated.

Rule 17, trivy. The floor gained trivy on 2026-11-02 (Issue-157). Its first run over `main` found 39 things of nine kinds. One was a fix, versioning on the replay bucket, whose objects are written once, so a version is never stored twice and a deleted timeline can be put back. Eight were scale-downs the rules already state, excused on the resource or in the ignore file.

Held back, the scale-downs trivy would fail. Excused by id in `terraform/.trivyignore` on 2026-11-02 (Issue-157).
