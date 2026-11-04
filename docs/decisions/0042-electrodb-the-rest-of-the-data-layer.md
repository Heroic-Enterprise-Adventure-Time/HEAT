# 0042: The rest of the data layer on ElectroDB, and how the backfill runs

- **Status:** Decided
- **Date:** 2026-11-03
- **Settles:** Issue-201, on the plan of decision 0041, which it amends where the work showed that plan wrong or chose between what it left open. The backfill's end is Issue-213.

## Decision

**Every method of the repository is on ElectroDB.** `db/entities.ts` holds nine entities, `adventure`, `camp`, `facility`, `hero`, `holding`, `ledger`, `open`, `profile` and `sighting`, all at version `1`. `db/keys.ts` holds the `TEMPLATES` they read. The tests spell the keys themselves in `test/keys.ts`, so that a template that drifts from the layout fails a test.

**The record's snapshot and result are stored whole,** as `CustomAttributeType<AdventureSnapshot>("any")` and `CustomAttributeType<SettledResult>("any")`. They belong to the engine and the settlement, and the hub only carries them. A `map` with declared properties would state those types a second time and drops a nested field it does not declare, on a write and on a read, where 0041's compile-time check cannot see it. That check covers `AdventureRecord`, `Hero`, `OpenAdventure`, `Player` and `Sighting`.

**The backfill is a step after every apply,** in `sandbox.yml`, `deploy.yml` and `release.yml`, where 0041 had it run once, after an environment had this code twice. `db/backfill.ts` scans each table once, keys only, updates each item without `__edb_e__` and logs counts only. A run before `/previous/graphql` is on ElectroDB is harmless and only leaves work for the next, so the count to trust is the one from the second deploy of this code in an environment. It is done when that count is zero, as 0041 says. In `release.yml` the step has `continue-on-error`, because `prod` is live by then and a failure must not leave the release without its tag; a failure stays visible on the step, and Issue-213 reads the count.

**The backfill's condition is `attribute_exists(PK) AND attribute_not_exists(__edb_e__)`.** The spike's shape in 0041 had only the second half. Without the first, a settle that deletes an `OPEN` item between the `Scan` and the `UpdateItem` has it written back as a husk, and that player can never start again.

**A raw read answers one page.** 0041 wrote `pages: "all"` beside `data: "raw"`, and ElectroDB 3.9.3 returns from its loop after the first page when the read is raw (`src/entity.js`, line 743). The camps' `Query` therefore pages by the raw `LastEvaluatedKey` as its `cursor`.

**The camps' location comes from the sort key,** because a holding from before ElectroDB has no `location` on it, and `parse` answers only what is on the item. A facility's `kind` comes from the item: its only writer has written it since it first existed (84c3dd0).

**`required` stays on the attributes an old item may lack,** the hero's `level`, `xp`, `picks` and `status`, the camp's levels and counts, a sighting's `level`. ElectroDB enforces it on a write and not on a read, so a write keeps its check, and the functions that read those items state the true shape in their parameter types and default what is absent.

**Each item of a transaction is written beside the error its condition throws,** through `on(failure, item)`, so that an item added to a verb cannot shift the errors of the items after it.

## Considered and not chosen

**A `map` with declared properties for the snapshot and the result.** See above.

**A workflow the owner runs by hand for the backfill.** It makes prod's `Scan` a deliberate act, the one thing it does better. GitHub dispatches a workflow only when its file is on the default branch, so a new one could not run in the sandbox stack before the merge, and it needs someone to remember it in each environment.

**A job of its own after the tag, for the backfill in `release.yml`.** It keeps a failure red on the run, and costs a checkout, an install and a role assumed again, for a step Issue-213 deletes.

**Two passes of the `Scan`, the second to count, strongly consistent.** The first answer here. Every run read both tables whole twice, at twice the read units, in every environment on every apply. One pass counts as it goes, and an item a scan missed is the next run's.

**`required` taken off those attributes.** The first answer here, which lost the check on a write to serve a read that does not enforce it.

**A copy of the old mappers in the tests, until Issue-213.** See "What it rests on".

## What it rests on

**The old code reading a new item.** 0041's row for this was proven by a test on the old mappers, which this change deletes. On the first deploy of this change the previous route is that code, reading items this change wrote. That rests on those mappers reading named fields and on the tests at a6399e7, and no test on the tree runs it after this change; the stack test only asks `/previous/graphql` for its version. It stops mattering on the second deploy.

## Facts checked

All on 2026-11-03, on `heat-sb201` unless it says otherwise.

- **ElectroDB 3.9.3, offline,** with `params()` and `parse()`: `any` keeps an undeclared nested field on a write and on a read, `map` drops it on both, and a record with no snapshot parses without error. **Its source:** the raw return above.
- **A stack that held old items, three runs:** 41762812644 on `main`'s code; 41764498687 on this change with `main` as the previous route, 3 items made whole and 0 remaining; 41765116762 with this change as the previous route, 0 and 0. Those runs had the earlier two-pass step. The apply role can run the `Scan` and the updates in the sandbox account, which 0041 had read only from the modules.
- **A settled adventure from before the change,** read as `player1` with its timeline, byte-identical before and after: 28,742 bytes, the same sha256.
- **The first cold start, one sample:** 899 ms of initialization, 346 ms for the first request, 144 MB, against the spike's 881 ms, 272 ms and 143 MB.

## Where it is described

`docs/standards/graphql.md`, rules 17 and 18. `docs/architecture/overview.md`, "Services and data". `docs/process/deployment.md`, rule 4. `packages/hub/src/db/entities.ts`, `packages/hub/src/db/backfill.ts`, `packages/hub/test/backfill.test.ts`.
