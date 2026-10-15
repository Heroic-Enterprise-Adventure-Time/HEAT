# 0013: DynamoDB and S3 only: no relational store, no VPC

- **Status:** Decided
- **Date:** 2026-10-14, recorded 2026-10-15
- **Supersedes:** 0005, 0006

## Decision

All game data lives in DynamoDB and S3. Player-private data (players, holdings, the materials ledger, the open-adventure item) and public game data (adventure records and what the browse views read) are separate tables with separate access roles, and private data is read only through the hub. Replay timelines are objects in S3. Static content such as unit types, jobs and locations is TypeScript data in the engine package, imported by the client and the hub alike.

The materials ledger, the one-open-adventure rule and settlement are DynamoDB transactions with condition expressions. Referential integrity lives in the code. No function runs inside a VPC: every AWS call goes to a public service endpoint under the function's role.

**What the spike proved** (2026-10-14, `packages/hub`, against DynamoDB Local): starting an adventure is conditional on none being open, and of two concurrent starts exactly one succeeds; a debit is conditional on the balance, and of two concurrent debits of the same holding exactly one succeeds; settlement is idempotent on the adventure id, so a repeated settlement is refused and pays nothing. Not yet proved: the hub's cold start and the real IAM path, which the first deployment measures.

## Considered and not chosen

**RDS Postgres on `db.t4g.micro`**, the 0006 shape, $11.68 a month in us-east-1 (price list, 2026-10-13). Always on, and it pulls the hub into a VPC with every egress question that brings.

**Aurora Serverless v2.** Does not pause while a connection pool holds connections, and resuming takes about fifteen seconds.

**Aurora DSQL.** Postgres-compatible, no VPC, scales to zero, which made it the serious relational candidate. Per operation it is one to two orders of magnitude costlier than DynamoDB: $8 per million DPUs against $0.625 per million write units (prices read 2026-10-14), about $31 against about $0.50 a month at a hundred thousand adventures a month under the assumptions in the private notes. Transactions run at repeatable read with conflicts detected at commit, and DDL cannot share a transaction with DML. It stays the fallback if the index design ever cannot express a query the game needs.

**Everything in Postgres**, 0005's alternative. Moot without Postgres.

**What is given up.** Ad hoc queries across the model; the reporting pipeline's export to S3 is where those will run. Every access pattern for search and browse must be designed as a key or an index before the feature is built.

## Where it is described

`docs/architecture/overview.md`, "Services and data", "The adventure loop", "Private holdings" and "Environments". `packages/hub/src/db`.
