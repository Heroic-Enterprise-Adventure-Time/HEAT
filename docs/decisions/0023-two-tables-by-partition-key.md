# 0023: Two tables, named for their partition key: player and location

- **Status:** Decided; the keys are written through ElectroDB's templates per 0041; the location table may store an owner id served only through a scope, per 0043
- **Date:** 2026-10-17
- **Amends:** 0013, "separate tables with separate access roles" for private and public data: the split stands, and its reason and its names are these.

## Decision

Game data lives in two DynamoDB tables per environment, `heat-<environment>-player` and `heat-<environment>-location` (`heat-sb<issue>-player` in a sandbox stack). Each is named for its partition key, which is the one property of a table that cannot change.

**The player table** is partitioned by player: `PK = PLAYER#<id>`. Its item collection is everything the owner asks for in one read: the profile, heroes, holdings and facilities per location, the ledger, the open adventure. It is private: read only through the hub, under field-level authorization.

**The location table** is partitioned by location, `PK = LOCATION#<id>`, and by adventure for the record settle looks up by id, `PK = ADVENTURE#<id>`. Its collections are what everyone may see: the adventures recently completed here, the heroes present, offered jobs, shared projects. One global secondary index with generic keys serves "replays of this job" and "my history" when the location view is built.

**What is free to change, and what is not.** Items have no schema: an entity grows richer by writing more attributes, with old items defaulting in code. A new entity type is a new sort-key prefix in an existing collection. A new way of asking is a global secondary index, added to a live table and backfilled. The partition key is the one decision that is a new table and a copy, so each table is partitioned by the thing its readers ask for, and the register of access patterns in the overview is written before a feature, not after (0013).

**Why two and not one.** AWS's guidance is as few tables as possible, with the stated exception of "datasets that have very different access patterns" (DynamoDB developer guide, "NoSQL design for DynamoDB", read 2026-10-17). These two differ in every per-table property: partition key, reader, stream and backup. A role that reads the location table, the live-channel function or the reporting export, cannot read a player's holdings, which only a table boundary gives cleanly. Start and settle write to both tables in one `TransactWriteItems`, which spans tables in one account and region, so the split costs the transactions nothing.

**Naming.** Prefixed in every environment, `heat-sb<issue>-`, `heat-dev-`, `heat-prod-`, because the bootstrap boundary allows IAM writes only under the account's prefix and the plan role's log permission is keyed on it; a table, a function and a role that share a prefix read as one environment in the console, in CloudTrail and on the bill. No suffix such as `-data`: the prefix already says whose it is.

**Later tables.** The live channel's connections, which expire by TTL and are read by the socket function, get their own table in build order step 4. Replay timelines are objects in S3 keyed by adventure id. A table of global game data organized differently from these two would be a third table, not a new key shape forced into one of them.

## Considered and not chosen

**One table for everything**, the spike's shape. It cannot have both the player and the location as its primary key, so one of the two main reads becomes an index read; a role could not be granted the public half alone; and one stream would carry every private write to the live feed's consumer.

**Classification names**, `private` and `public`. They say what the security rule says, but not what the table is partitioned by; and the location table will hold items of both classifications' readers (an offer is public, its owner's acceptance record is not) once the game grows, while its partition key will not change.

**Content names**, `players` and `adventures`. The location table holds more than adventures, and in DynamoDB a table is the unit of access control and partitioning, not of one entity type. A relational table maps to an item type here, told apart by its sort-key prefix.

**Splitting the player table by entity type**, heroes apart from holdings. Every per-player read would become several reads, which is the cost single-table design exists to avoid, and no reader differs between the two.

## Facts checked

All read on 2026-10-17.

- **Table count** (DynamoDB developer guide, "NoSQL design for DynamoDB"): "you should maintain as few tables as possible in a DynamoDB application"; "Exceptions are cases where high-volume time series data are involved, or datasets that have very different access patterns."
- **Single versus multiple tables** (the same guide, "Data modeling foundations"): multiple-table design is "a good and sufficient approach" when access patterns do not need several entity types together; reasons to separate include that "Backups are all or nothing", that every change on a single table "will be propagated to DynamoDB Streams even if only a subset of entities need to be processed", and that "When using GraphQL, single table design will be more difficult to implement". The last does not bite here: the hub's resolvers call a repository, not tables.
- **Transactions across tables** (DynamoDB API reference, `TransactWriteItems`): a transaction groups up to 100 write actions "in one or more tables" in the same account and Region.

## Where it is described

`docs/architecture/overview.md`, "Services and data". `packages/hub/src/db/keys.ts`, `terraform/modules/environment/tables.tf`.
