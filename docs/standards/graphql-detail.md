# GraphQL and the hub: the detail

The detail behind `docs/standards/graphql.md`: what its rules need when their kind of work is done, not at a session's start, the whole of the rules it writes as a single line, what it holds back and why its rules are as they are. Its rules are that document's, by their numbers there; each section here is named for the rule it serves (decision 0060, as amended by Issue-428).

Nothing loads this file. It is read by section when the work names it (`docs/process/sessions.md`, rule 18), and whole by the review skill and the checkup: "Rules 1, 3 and 4" when the schema's lint, a name or an enum changes; "Rules 6 to 9" when a mutation, a refusal or a race's handling changes; "Rule 11" when a field is added, made public or given a scope; "Rule 14" when an input check is added; "Rule 16" when a log line, a metric or a span changes; "Rules 17 and 18" when the repository, an entity, a transaction or an SDK client changes; "Rule 20" when a race's test is written; "Rules 22 and 25 to 29" when a module reads the environment or a test fixes a draw or the content; "Held back" when a lost race's read is weighed; "Why" when a rule's reason is in doubt.

## Rule 1: the schema's lint

The file is linted under `@graphql-eslint`'s `all` tier; `alphabetize` is off because the printer orders the file, `no-root-type` because it forbids the `Mutation` root, `strict-id-in-types` because the API's value types (`Reward`, `Holding`, `UnitStats`) have no identity, and `require-field-of-type-query-in-mutation-result` because the client reads the player again after a mutation rather than refetching through a `query` field. The client's operations, `packages/client/src/app/graphql/*.graphql`, are linted under the plugin's operations `all` tier against the same schema, so a document the hub would refuse fails lint; `no-one-place-fragments` is off because a fragment there names the shape a view type derives from (angular.md, rule 5), and the two lint blocks share one parser configuration, because the plugin keeps the first it is given for every file after.

## Rule 3: names

Lint `naming-convention` holds types `PascalCase`, fields and arguments `camelCase`, enum values `UPPER_CASE`, no `Type`, `Enum` or `Input` noise in a type's name, and no `get` or `query` prefix on a root field. A mutation is a verb phrase naming what it does to what: `recruitHero`, `startAdventure`, `discardAdventure`.

## Rule 4: the enums

An identifier the hub issues stays `ID`; `UUID` is for one the client makes. The hub's own enums are `HeroStatus` and `AdventureStatus`; the engine's are `UnitType`, `Material`, `GatheringTrait`, `FacilityKind`, `AdventureOutcome`, `StageKind`, `StageEnding` and `Unlock`. The enum definition maps the wire's spelling to the engine's, so that nothing past `game.ts` in the client sees a wire value.

## Rules 6 to 9: results, repeats and races

Rule 6: a success wraps `hero`, `camp` or `adventure`; `Requires.missing` is another refusal's field. A function keeps throwing a typed error and the plugin resolves it to its type. `joinGame`, which nothing refuses, answers a union of its success alone. The shape is Apollo's "Errors as data" guide (decision 0038). The request refused before any resolver runs is one such as a query for a field the schema does not have, answered with HTTP 400, not with 200.

Rule 7: a repeat is the player's or the SDK's after a timeout. A `requestId` that recruited a villager sent again for a fighter is `BAD_USER_INPUT`: a mismatch is the client's defect (the Builders' Library, "Making retries safe with idempotent APIs").

Rule 8: `recentAdventuresAt` lives in `recent.ts` on the same terms as `heroesSeenAt`: the repository and what the rule needs in, the answer out, tested as a function.

Rule 9: the reads are strongly consistent because an eventually consistent read may not show the winner's writes yet. The read that would find the work done is the hero by its request id, the level built, the record settled or discarded; a repeat that won changed what the loser reads.

## Rule 11: what is public, and how the walk reads scopes

Public by decision, with what each contains, so that the list is reviewed: `player(id)`, whose one public field is `id`, the token's subject, which the caller already holds, so that what it tells a caller is whether that id has a profile; `version`, a commit hash; `SeenHero`'s `id`, `name`, `unitType`, `spriteSet` and `level`, where the name is one the hub drew and nothing says whose a hero is (decision 0029); `RecentAdventure`'s `id`, `job`, `outcome`, `stages`, `credited`, `party` and `settledAt`, and `RecentAdventureHero`'s `name`, `unitType`, `spriteSet`, `level` and `died`, an adventure settled at a location in the last week, read from a feed item that stores no owner and no hero id (decision 0050); and a settled `adventure(id)`, for its replay, which `replaysOf(job)` lists by the same type: its id, seed, start time, the time it settled, location, job, version, status, result and timeline, a caravan's destination, cargo and the ids of the heroes who stay, and a snapshot of the party's hero ids, hub-drawn names, unit types, sprite sets, levels and stats, with no owner. The result lists the unlocks the run earned, whether or not its player held them, so it says what the run did and nothing of what a player holds; which were new is read from `unlocks`, the owner's alone (decision 0059). A caravan's result says what it delivered and what the destination's cap turned away, which says as much of that warehouse as `credited` and `lost` say of the origin's (Issue-354).

`ACCESS` is the place to read the access rules at a glance: anyone, any signed-in player, or only the owner. The scope-auth plugin cannot deny by default, so the test walks the built schema and fails on any field it reaches whose access differs from the table, which closes a new field until someone adds it (decision 0043). `authenticated` does not stop the walk, because every player passes it. `self` stops it, and so does a mutation with a scope, because it answers the caller's own work, so a new field only those reach, on `Hero` or `Camp`, is not in the table. Any other scope fails the walk until the table has a group for it. The test reads scopes, so what a resolver decides at run time and what a field holds are read in review. The builder's `unauthorizedError` is there because the plugin's own error keeps its code where Apollo does not read it and would answer `INTERNAL_SERVER_ERROR`.

## Rule 14: the checks on the schema

A request id the client makes is a `UUID`. The zod schemas hold, besides a party, a log of at most `MAX_OVERRIDES` entries, the length of an ability id, and a known location where a field does nothing else with it. A limit a schema holds is stated in the field's description so that the printed schema shows it as a scalar's does. What stays in the verb: the job exists at this location, the hero is the player's, the level is the next, an entry names a hero of the party. A scalar's refusal is Apollo's own `BAD_USER_INPUT`, with HTTP 400 because execution never started. That input is checked before a scope is decided by the plugin's place in Pothos. The checks are counted by rule 30's test, which reads each zod schema from the options Pothos keeps on the built field, as rule 11's walk reads a scope.

## Rule 16: the log and the span

The per-error warning carries its message and path. A root field's span carries the field's name and the deploy's version; the tracing wrapper's arguments, source and errors stay off, and `test/tracing.test.ts` holds the span to that through the handler (decision 0055). The malformed value a message may carry is a scalar's or `badInput`'s, because it is the client's own defect and nothing of a player's. A metric's dimension is a name such as the verb.

## Rules 17 and 18: the repository and its transactions

Rule 17: the record's snapshot and result are each one attribute typed from its own type. Only the camps' `Query` by prefix takes `ignoreOwnership`, because it reads several entities' items (decision 0041). ElectroDB's `parse` is the other place ownership is not checked: it ignores it by default. Its `data: "raw"` ignores `pages: "all"`. `keys.ts`'s `TEMPLATES` are what the entities read. Every SDK client takes its HTTP timeouts from `src/sdk.ts` with `throwOnRequestTimeout`, so that a stalled call fails, retries included, inside the function's 10 seconds; the values and the facts behind them are in that file, and `test/timeouts.test.ts` stalls a call to prove them.

Rule 18: the typed error is one the function reads, and a `TransactionConflict` is retried by the caller. The other transaction is still committing, and the SDK does not retry a cancelled transaction, so a read made at once may not show it: the verb runs again after a wait drawn from zero up to 50 ms and then up to 100 ms, the SDK's own schedule and the form the developer guide recommends between concurrent clients. Settlement's loop waits the same backoff. Every run again is a warning in the log (rule 16) and a `TransactionConflictRetry` count by verb; every `Conflict` answered is a `ConflictAnswered` count, by service for the alarm and by verb for reading, counted in one place; the environment's alarms watch that count and each table's own conflict metrics. A repeat is a typed error the caller maps.

## Rule 20: races

The race test runs every point at which the winner can land, not only those that concurrent requests happen to hit. A failure that sequential requests cannot produce is what `cancelled` makes. A verb's calls made together are raced one at a time because a call is counted as it starts.

## Rules 22 and 25 to 29

Rule 22's third pair is `ReplayEnv` and `replayBucketFromEnv`. Rule 25 holds because a draw is an input like a store, a version or the time, which `startAdventure` already takes as a parameter; rule 26 says how the seed is chosen, and a test that rebuilt `<seed>#1` and `s1-wolf-1` to predict a wolf's hide would fail without saying why. Rule 27 holds the content as rule 25 holds a draw, because the content decides what a run pays and unlocks. Rule 28's conditions: `unlockHeld` in `db/repository.ts`; since the review of PR-371 (Issue-354), the capped credit of a holding with its ledger entry is `cappedCredits`, which settlement's credits, a caravan's deliveries and a discard's returns each call, and the check of a camp's warehouse level beside it `warehouseHeld`. Rule 18 says a rule is held by a condition; rule 28 says the condition has one text. Rule 29 orders what rules 25 and 27 put last.

## Held back

- **A snapshot read for a lost race** (Issue-175, 2026-11-02). Rule 9's re-read is separate reads, a `Query` of the camp and a `GetItem` of the hero, and DynamoDB isolates them from a transaction only as read-committed: while the winner's transaction is committing, a read can see some of its items new and others old (the developer guide's "Isolation levels for DynamoDB transactions"). A loser that reads in that window can still answer a refusal for a repeat it lost to; the window is the winner's commit, milliseconds, against the seconds between a request and its repeat. `TransactGetItems` over the items a verb reads closes it, at the cost of a read per verb built from keys rather than the camp's `Query`, and a retry when the read conflicts with a write. Held back as out of proportion while nothing has shown the window; a race that does is the reason to build it.

## Why

Code first with the printed schema committed is decision 0012's shape, and the committed file is what makes a schema reviewable (`docs/standards/typescript-detail.md`, "Why"). The rules for scalars, input objects and result unions are the GraphQL community's accepted practice, as Apollo's schema design guides state it, weighted above the code as it was (Issue-155): a union per mutation puts every refusal a player can get into the contract, typed, where a client reads it with `__typename` instead of a string it has to know. The two tiers of error, data for the game's refusals and the `errors` array for what is not the game's business, follow the same guide. The enum values' two spellings, the API's on the wire and the engine's inside, are the shape the tools on both sides are built for, and renaming the engine's values would have been a migration of stored data for a naming preference (decision 0038).

One place for each check is decision 0039: a check on the schema is visible to a reader of the contract, runs before the reads it saves, and is tested without reaching a verb.

Rules checked twice is the shape every transaction takes (Issue-81): the read gives the reason, the condition gives the guarantee, and neither alone does both. The hub choosing the seed and the name is decision 0001's verification made real: a client that chose its randomness could choose its outcome.

Authorization by declared scopes is decision 0012's reason for Pothos's scope-auth plugin, and the list of public fields is in this file and in the test's table so that adding to it is a reviewed change a test holds to. Lines and never bodies, because a GraphQL response can hold a player's whole camp, and a log that held it would be a second copy of the private table.
