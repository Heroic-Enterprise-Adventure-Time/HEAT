# 0041: ElectroDB is the data layer

- **Status:** Decided
- **Date:** 2026-11-03
- **Settles:** Issue-200: how ElectroDB is adopted, from the library review of 2026-11-03 (row 1), where the owner chose it over dynamodb-toolbox that day. The adoption of the rest is Issue-201.

## Decision

**ElectroDB is the data layer, behind the `Repository` API.** The review found `db/repository.ts` writing by hand what the library names: 49 expressions with their name and value maps, 26 casts, a pagination loop, cancellation reasons mapped by position. By typescript.md rule 17 a common problem takes the library an enterprise system would use. The spike moved recruit and retire, the two verbs that write to both tables, and every other method stays hand-written until Issue-201.

**The shape.** `db/entities.ts` builds one `Service`, `heat`, over five entities at version `1`, `camp`, `hero`, `holding`, `ledger` and `sighting`, whose key templates reproduce `keys.ts` exactly, with `casing: "none"` on every key because ElectroDB lowercases one by default. A verb is `service.transaction.write`, a `where` per item, and the result's `code` per item mapped to the same typed errors. The composite attributes of a key are written on the item as well as in it, so a player-table item gains `playerId`, and a sighting, whose composites are its location and hero, still holds no owner (decision 0029).

**The transaction across the tables needs nothing special.** Each entity names its own table in its configuration, the `Service` names none, and the transaction goes to both. The maintainer's per-commit `table` also works and is not used.

**The identifiers stay, and the tables are made whole by a backfill.** ElectroDB writes `__edb_e__` and `__edb_v__` on every item; their names can be changed, their presence cannot. What that means for an item the old code wrote:

| Operation | What happens | Proven by |
| --- | --- | --- |
| Read, default | Not found: `get` answers null, a query drops it | `test/electrodb.test.ts` |
| Read with `ignoreOwnership` | Found, by matching its keys; the key's composite attributes are absent, though the entity's type says present | the same |
| `update` | Clean: sets both identifiers and the composite attributes and changes nothing else, a stored null included, so a write makes that item whole | the same |
| The old code reading a new item | Clean: its mappers read named fields, so the previous route of decision 0030 still works | the same, and every other test |

## The migration plan, for Issue-201

The order is forced by the previous route: until the deploy before the current one is also on ElectroDB, its `Put`s go on writing items without identifiers.

1. **Every read takes `ignoreOwnership: true`** as Issue-201 moves it, so nothing depends on the identifiers yet. Writes make items whole as they touch them.
2. **Issue-201 adds the entities for the items the spike has none for:** the profile (`PROFILE`), the open adventure (`OPEN`), a facility (`AT#<location>#FACILITY#<kind>`) and, in the location table, the adventure record (`ADVENTURE#<id>`, `RECORD`). They come with the verbs that use them, because the record's nested snapshot and result are the hardest to model and are only proven by those verbs' tests.
3. **After Issue-201 has reached an environment twice,** so that `/previous/graphql` is on ElectroDB too, the backfill runs in that environment, the sandbox stack first: a `Scan` of each table that pages until `LastEvaluatedKey` is absent, and for each item without `__edb_e__` a conditional `UpdateItem` setting both identifiers and the composite attributes, which the keys give. `attribute_not_exists` on the identifier makes it safe to repeat and safe beside live writes. `test/electrodb.test.ts` holds its shape for the hero, the camp, the holding and the ledger entry, over one partition; the other four item types, and a whole table, are Issue-201's to prove.
4. **What it leaves:** the spike's `HOLDING#<material>` items, which no entity's key matches and nothing reads (decision 0026). Sightings are not worth writing: they expire within a week, so the table is whole once a week has passed with the previous route on ElectroDB.
5. **It is done when a count of items without `__edb_e__`, those left aside apart, is zero.** Then `ignoreOwnership` comes off every read but the camps' below.

What runs it is the pipeline, under the apply role: the hub's role has no `dynamodb:Scan` (`terraform/modules/environment/functions.tf`) and the plan role is denied item reads, while the apply role's `AdministratorAccess` under a boundary allowing `dynamodb:*` covers it. That was read from the modules, not exercised; Issue-201 exercises it in the sandbox stack first.

## What Issue-201 has to do differently

**The camps are not a collection.** ElectroDB's collection over custom key templates has no sort-key condition: `KeyConditionExpression` is `#pk = :pk`, clustered or not, so `camps()` would read the whole partition, the ledger with it, on every request, and a ledger only grows. Decision 0026's one `Query` by prefix is instead `camp.query.primary({ playerId })`, whose empty composite gives `begins_with(SK, "AT#")`, with `data: "raw"`, `pages: "all"`, `consistent: true` and `ignoreOwnership: true`, and each entity's `parse` then takes its own items out of the answer. That query keeps `ignoreOwnership` for good: without it, it is filtered to camps alone.

**A sightings window needs `raw` for its count.** `limit` is DynamoDB's `Limit`, applied before the filter on expiry, which is decision 0029's bound. `count` goes on reading until it has that many, and is not. `heroesSeenAt` needs how many items were read, `ScannedCount`, and `go()` keeps only `data` and `cursor`, so that read also takes `data: "raw"` and `parse`. The upper bound of the window is `SEEN#g`, above every hex hero id, where the old code writes `SEEN$`, because a template cannot state `SEEN$`.

**`ConsistentRead` is the `consistent: true` option,** on `get` and on a query alike.

**An attribute no entity declares is dropped without an error,** where the hand-written `Put` stored every field. `db/entities.ts` therefore checks at compile time that the entities cover `Hero` and `Sighting`, and each entity Issue-201 adds for a type written whole, the adventure record above all, joins that check.

**What ElectroDB does not spare.** A `where` with several conditions is still joined by hand, `${op.eq(...)} AND ${op.gt(...)}`, and "not a string" is `NOT ${op.type(a.adventureId, "S")}`. The names and values are the library's; the shape of the condition stays visible, which is no loss.

## Considered and not chosen

**dynamodb-toolbox.** The nearer fit to the code as it stood: `execute` over mixed entities and positionally aligned `CancellationReasons` with helpers, which is the mapping the old `transact` does. A sixth of ElectroDB's users (0.58M a month against 3.0M, npm, 2026-11-03). The owner's call. Whether it writes a marker attribute of its own was not checked.

**Dynamoose.** A model layer; its transaction page does not say whether an item takes a condition, and conditions on every item are the point (graphql.md, rule 18).

**OneTable.** 0.14M a month, a quarter of dynamodb-toolbox's. Not read further.

**`ignoreOwnership` for good, with no backfill.** No migration, but every read carries the option for ever, the tables stay mixed, and the type of a composite attribute stays false on old items.

**Renaming the identifiers.** Possible, and buys nothing: nothing else reads them.

**The hand-written expressions, kept.** They are correct and every test passes on them. Rule 17's weighting is what the code shows and teaches, not only when it outgrows itself.

## What it cost

Measured on 2026-11-03 for the two verbs, with one esbuild configuration, `scripts/bundle.mjs`'s.

| | Before | After |
| --- | --- | --- |
| `recruit` and `retire`, lines | 98 | 66 |
| Hand-written expression properties in `repository.ts` | 49 | 39: the two verbs' 10 are gone |
| `repository.ts`, lines | 963 | 949 |
| `db/entities.ts`, lines | none | 129, which Issue-201 reuses |
| The hub's bundle, unminified | 4,815,208 bytes | 5,311,262 bytes: `electrodb` 434,130, `jsonschema` 57,275 |
| The same, gzipped | 803,949 bytes | 884,725 bytes |
| Cold start, stack test's report, one sample each | 769 ms of initialization, 254 ms for the first request, 135 MB | 881 ms, 272 ms, 143 MB |

## Facts checked

All on 2026-11-03.

- **ElectroDB 3.9.3's published source and DynamoDB Local** (`packages/hub/test/electrodb.test.ts`): the identifiers, `ignoreOwnership`, the transaction across the tables committed and cancelled from either side, the collection's key condition, `limit` against `count`, `raw` and `parse`.
- **A real race on `heat-sb200`, as a test user:** eight concurrent copies of one recruit and of one retire, ten rounds. DynamoDB Local answered twelve concurrent retires over twenty rounds with no `TransactionConflict`, so the test cancels through an SDK middleware and only this race shows DynamoDB's own: 24 "transaction conflict; running again" warnings, twelve per verb, each a cancelled item's `TransactionConflict` mapped and retried; no `Conflict` answered, no refusal, no error in the log, and the camp's counts back at zero. The gateway's throttle turned away 22 of the 160 calls.

## Where it is described

`docs/standards/graphql.md`, rules 17 and 18. `docs/standards/typescript.md`, rule 17. `packages/hub/src/db/entities.ts`, `packages/hub/test/electrodb.test.ts`.
