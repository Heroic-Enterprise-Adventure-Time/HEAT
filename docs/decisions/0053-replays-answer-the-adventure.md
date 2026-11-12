# 0053: A job's replays answer the adventure itself, and the index is keyed from an attribute only settlement sets

- **Status:** Decided
- **Date:** 2026-11-12
- **Settles:** Issue-289: what `replaysOf(job)` answers, and how the adventure record gets the keys of the location table's index, both of which the build of decision 0050 changed. Agreed with the owner in the Issue-289 session on 2026-11-11 and 2026-11-12, and written as a record on the review of PR-299.
- **Amends:** 0050, "It answers what a list shows, the adventure's id, its outcome, the party's public fields and when", and "`GSI1PK = JOB#<jobId>`" as the attribute the key is made from. The rest of 0050 stands: one sparse index on the record, set at settlement only, projection `ALL`, newest first, `Limit` 20, every outcome, no backfill.

## Decision

**`replaysOf(job)` answers the adventure records themselves**, `[Adventure!]`, through the type `adventure(id)` already serves a settled adventure by to any signed-in player: its id, seed, start time, location, job, version, status, result and timeline, and the snapshot of the party with its hero ids. `Adventure` gains `settledAt`, null until the adventure settles, because a list says when. The index projects the whole record, the player's id included, and the hub is its only reader; what is stored is not the seam, what a field serves is (decision 0043; the owner, 2026-11-11). `Adventure` has no owner field, so a replay says nothing of whose it was, and when `owner: Player` is built under its own scope, a replay gets it with no further work.

**A list does not ask for `timeline`.** It is one read of the replay bucket per adventure, so twenty replays asked for with their timelines are twenty reads, made together. The field's description says so, the one client is ours, and the list is bounded at 20 for a signed-in player. Nothing enforces it.

**The index's keys are made from `replayOf` and `settledAt`**, two attributes that only the settle transaction sets: `GSI1PK = JOB#<replayOf>`, `GSI1SK = <settledAt>`. `replayOf` holds the job's id again, and is hidden in the entity, so no read answers it. An open or discarded record carries neither attribute and neither key, as 0050 decided.

**The hub's role may `Query` the index and nothing else on it**, in a statement of its own naming the index's ARN, whose name the policy and the table read from one local.

## Considered and not chosen

**The feed's type, `RecentAdventure`, built from the record**, with no hero id, which the agent proposed first. It applied the feed item's rule, which is about what the item stores (decision 0050), to a read of the record, which stores the ids anyway and already serves the hero ids on `adventure(id)`. It would also have named a months-old replay "recent".

**A type of its own, `Replay`, with the id, the outcome, the party and when**, 0050's sentence as written. It copies fields `Adventure` already has, and gives the client a second shape for one thing. It is also the type that would keep `timeline` out of a list, which the review of PR-299 raised; the owner kept `Adventure` (2026-11-12).

**A query complexity limit**, the other way to stop twenty timelines in one request. A mechanism for the whole API, to be designed when a cost needs one.

**ElectroDB's `condition` callback on the index**, the library's own device for a sparse index. An index with a condition must be given every one of its composites on any write that names one, and the start's `create` names `jobId` and has no `settledAt`: it throws "Incomplete composite attributes" before anything is written.

**The index keyed on `jobId` and `settledAt`, with no condition.** ElectroDB writes each key of an index as soon as a write holds that key's composites, so every record would carry `GSI1PK` from its start. It would still be out of the index, which needs both keys, and the code would be one attribute shorter; but 0050 decided that an open or discarded record carries neither, and a key attribute on every open record is one more thing a later reader of the table has to know means nothing. The owner kept `replayOf` (2026-11-12).

**The index's ARN in the statement that names the tables.** IAM gives the write actions listed there nothing on an index, so the grant would be the same, and a reader would see writes listed against an index the code only queries.

## Facts checked

- **ElectroDB 3.9.3, tried against DynamoDB Local on 2026-11-11**, the first fact 0050 left open: with a `condition` on the index, the start's `create` throws as above (`entity.js`, `_getIndexImpact`); with none and `jobId` as the partition key's composite, the stored record carries `GSI1PK` and no `GSI1SK` from its start; with `replayOf` and `settledAt`, an update that sets both writes both keys, and the items as stored are held by `packages/hub/test/replays.test.ts`.
- **Terraform adds the index to a live table in place**, the second: the plan against `heat-sb289` on 2026-11-11, AWS provider 6.72.0, was `0 to add, 4 to change, 0 to destroy`, the table updated and nothing replaced, and `dev`'s plan on PR-299 the same with its `previous` alias as a fifth. The apply waited 8 min 36 s for the index to become active on a table with almost nothing in it. That release deprecates `hash_key` and `range_key` inside `global_secondary_index` for `key_schema` blocks (the provider's `dynamodb_table` page, read 2026-11-11).
- **A `Query` of an index is authorized on the index's ARN** (AWS's service reference for DynamoDB, `v1/dynamodb/dynamodb.json`, read 2026-11-11): the action's resource types are `table` and `index`, and an index's ARN is the table's with `/index/<name>`. The stack test reads the index with the function's own role.
- **A list's fields are resolved together**, so twenty timelines are twenty reads at once, not one after another (graphql-js executes the items of a list concurrently; not measured here).

## Where it is described

`docs/architecture/camps.md`, "Built (Issue-289, decision 0053)". `docs/standards/graphql.md`, rule 11. `terraform/modules/environment/tables.tf` and `functions.tf`. `packages/hub/src/db/entities.ts`.
