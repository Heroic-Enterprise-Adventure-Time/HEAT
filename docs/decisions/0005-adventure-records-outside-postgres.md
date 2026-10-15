# 0005: Adventure records and replays live outside Postgres

- **Status:** Superseded by 0013
- **Date:** 2026-10-08

## Decision

Data ownership:

| Data | Store | Written by |
| --- | --- | --- |
| Players, heroes, unit types, jobs, locations, holdings, the open-adventure row | Postgres | Java service |
| Adventure records: status, seed, frozen snapshot, result, location, time | DynamoDB | Java service at start; verifier at verification |
| Replay timelines | S3 | Verifier |

## Considered and not chosen

**Everything in Postgres.** It would work at this scale. Adventure records are split out because their access patterns differ (by id, and by location and time) and because the split keeps the verifier away from the relational database. The cost is no foreign keys across stores, and rewards that land a moment after the adventure ends.

## Where it is described

`docs/architecture/overview.md`, "Services and data".
