# 0006: RDS Postgres, not Aurora

- **Status:** Working assumption
- **Date:** 2026-10-08

## Decision

The smallest RDS Postgres instance. Prices have not been checked yet.

## Considered and not chosen

**Aurora instead of RDS for read scaling.** Both support read replicas, and the routing and read-your-writes questions are the same on both. Aurora Serverless v2 will not pause while a connection pool holds connections, and resuming takes about 15 seconds.

## Where it is described

`docs/architecture/overview.md`, "Services and data".
