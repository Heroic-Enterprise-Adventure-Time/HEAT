# 0050: Recent adventures as a feed item, replays by job as one sparse index

- **Status:** Decided; what `replaysOf` answers and what the index is keyed from amended by 0053, which also holds the two facts this record left to be checked; the index built by Issue-289
- **Date:** 2026-11-10
- **Settles:** Issue-282: the location table's keys for the rest of build order step 3, which the overview's "Open" item and decisions 0013 and 0023 left to be designed before they are built: the adventures recently completed at a location, and the replays of a job.
- **Amends:** 0023, "One global secondary index with generic keys serves 'replays of this job' and 'my history'": the index serves replays by job only.

## Decision

**Recent adventures are a feed item in the location's collection** of the location table (decision 0023), one per settled adventure:

| PK | SK | Item |
| --- | --- | --- |
| `LOCATION#<location>` | `DONE#<settledAt>#<adventureId>` | an adventure completed there: its public fields and when the item expires |

`settledAt` is the record's own, an ISO 8601 time in UTC, which sorts as text in time order; the adventure id makes the key unique when two adventures settle in the same millisecond. The item holds the adventure's id, the job, the outcome, each stage's ending, what was credited, and the party's public fields: each hero's name, unit type, sprite set and level, and whether it died. **It holds no owner**, as a sighting holds none (decision 0029): the adventure record keeps the player's id for the hub's own checks (decision 0043), and the feed item is a copy without it, so nothing that reads the location's collection can say whose an adventure was.

**Written at settlement, and only there.** The settle transaction puts the item beside everything else it writes (`Repository.settle`), so an adventure is in the feed exactly when it is settled. A discarded adventure writes none.

**It expires after a week.** `expiresAt` is `settledAt` plus seven days, in epoch seconds, the attribute the location table's TTL is already set on, and the same week a sighting lasts, for the same reason: use is sparse, and a shorter time would leave the list empty most days. Every read filters on `expiresAt`, because DynamoDB deletes an expired item only within days (decision 0029, "Facts checked").

**The read is bounded.** `recentAdventuresAt(location)` is one Query of `LOCATION#<location>` on `begins_with(SK, "DONE#")`, newest first (`ScanIndexForward` false), with `Limit` 20. The filter is applied after the limit, so the read never passes 20 items. The page shows up to 10. The caller's own adventures are in it like anyone's. The query needs a signed-in player, as `heroesSeenAt` does.

**Replays by job are one sparse global secondary index on the adventure record.** The location table gains `GSI1`, with the generic keys `GSI1PK` and `GSI1SK`, both strings, projecting `ALL`:

| Index | `GSI1PK` | `GSI1SK` | On |
| --- | --- | --- | --- |
| `GSI1` | `JOB#<jobId>` | `<settledAt>` | the adventure record, `ADVENTURE#<id>` / `RECORD`, from settlement on |

The settle transaction sets the two attributes when it marks the record settled. An open or discarded record carries neither, so it is not in the index. `replaysOf(job)` is one Query of `GSI1` on `JOB#<jobId>`, newest first, with `Limit` 20, every outcome included: a retreat is as worth watching as an arrival. It answers what a list shows, the adventure's id, its outcome, the party's public fields and when; the replay itself is `adventure(id)` with its `timeline`, which already answers a settled adventure to any signed-in player (Issue-114). A job's id is unique across locations in the engine's content, so the key needs no location.

**Projection `ALL`.** The hub is the index's only reader, and a field that holds the owner is served only through a scope whichever way the record was read (decision 0043); a record is small, a snapshot of at most four heroes and a result; and ElectroDB reads an index item as the whole entity, which a narrower projection would leave short of its required attributes.

**The index is eventually consistent.** A replay may be missing from its job's list for a moment after its adventure settles. The list is read when a panel opens, not as the answer to a submit, and a test that settles and then reads waits for it.

**"My history" leaves the index.** A record carries one value for `GSI1PK`, so one index cannot be keyed by job and by player at once; 0023's sentence would have needed a second pair of keys or a second item. A player's history is private, is asked for by the player alone, and is not in step 3. It is designed when it is built, in the player's own collection of the player table, as an item of its own per adventure. The ledger cannot stand in for it: settlement writes one ledger entry per material credited, so an adventure that paid nothing, a retreat that forfeits its pay or a party all down, has no entry at all.

**No backfill.** Adventures settled before the deploy that adds these are in neither list: their records carry no `GSI1PK`, which also keeps them out of the index's own backfill, and their feed items would have expired within the week. The lists start from the deploy. A replay stored under an older timeline schema is "replay unavailable" (`docs/architecture/adventure-loop.md`), which is one more reason an old record is not worth listing.

**Room left for step 5, and nothing designed.** Shared facilities that players contribute to stay in step 5 (the owner, 2026-11-10). Two prefixes in the location's collection are kept for them, `FACILITY#<kind>` for a shared facility's state and `CONTRIB#` for what players give, so that nothing in step 3 or 4 takes them. Their shape, and how upkeep fits "no real-time gating" (game.md, "The adventure loop"), are step 5's to decide.

## Considered and not chosen

**Recent adventures through a second index on the record**, `LOCATION#<location>` by `settledAt`. The record carries the player's id, so the newest-here read would return it to the hub on every item, and a later reader of the table's stream, the live feed of step 4, would be handed the record with its owner when all it needs is the public line. The location is the table's own partition key (decision 0023); an item in its collection is the read the table was partitioned for, and it expires by the TTL the table already has, which an index entry on a permanent record cannot.

**One index for both lists**, the record keyed `LOCATION#<location>` in one pair of keys and `JOB#<jobId>` in another. Two pairs of keys are two indexes by another name, each written at every settle.

**Keeping feed items for good.** The collection would grow without end to serve a list of ten. The record is permanent; the feed is what is recent.

**A random sample, as the sightings are read.** A sample suits heroes walking about; "recently" is an order, and newest first is the one read that needs no explaining.

**The key `JOB#<location>#<jobId>`.** A job's id is already unique, and if the same job were ever posted at two locations its replays would be of the same stages.

**Only completed runs in a job's replays.** A list with no retreats would say a job cannot go wrong.

**Projection `KEYS_ONLY` or `INCLUDE`.** Each needs either a second read per replay or a list of attributes kept in step with the entity, to save bytes that do not matter at this size.

**Backfilling the settled records.** The last backfill was a step in the pipeline and a second pull request to remove it (Issue-201, Issue-213). `prod` holds few adventures, and the node rework of Issue-283 changes the timeline's schema, so their replays would not play.

**One index serving "my history" as well**, 0023's shape. See above: one record, one value per key.

## Facts checked

All read on 2026-11-10.

- **Sparse indexes** (DynamoDB developer guide, "Take advantage of sparse indexes"): "DynamoDB writes a corresponding index entry only if the index key attributes are present in the item"; "If either key attribute is missing from an item, that item does not appear in the index."
- **Adding an index to a live table** (the same guide, "Managing Global Secondary Indexes"): "the table continues to be available while the index is being built", and the index cannot be queried until it is `ACTIVE`; one index per `UpdateTable`; the build backfills from the table's existing items by the index's projection, which the sparse rule above limits to items that carry the keys.
- **Order and consistency** (DynamoDB API reference, `Query`): results are "always sorted by the sort key value", for a string "in order of UTF-8 bytes", and `ScanIndexForward` false reverses it; "Global secondary indexes support eventually consistent reads only"; a query reads up to `Limit` items "and then" applies the filter.

Not checked here, and for Issue-289 to check when it builds the index: how ElectroDB writes an index's keys on an update, and that the plan adds the index in place.

## Where it is described

`docs/architecture/camps.md`. `docs/architecture/overview.md`, "Services and data" and "Build order". `docs/design/game.md`, "Locations and camps". Built by Issue-288 (the feed item), Issue-289 (the index) and Issue-290 (the client).
