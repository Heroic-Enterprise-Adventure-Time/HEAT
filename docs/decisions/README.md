# Decision records

One short record per significant decision: what was chosen, what was considered and not chosen, and why.

## Rules

1. Write a record when a choice is made between real alternatives and someone could later ask why.
2. Write a record when a disagreement still stands after the project owner has decided. See rule 4 in `docs/process/collaboration.md`.
3. A record is numbered with the next four-digit number and named `<number>-<short-title>.md`.
4. A record uses the sections Decision, Considered and not chosen, and Where it is described. Its status is **Decided** or **Working assumption**, with the same meaning as in the design documents.
5. A record is history and is not rewritten. When a decision changes, write a new record and change the old record's status to "Superseded by" the new number.

## Why

The design and architecture documents say what is true now. They are edited as the design changes, so they lose the alternatives that were weighed along the way. The records keep those.

## Index

| Record | Decision | Status |
| --- | --- | --- |
| [0001](0001-adventures-run-in-the-browser.md) | Adventures run in the browser and are verified by the server | Decided |
| [0002](0002-no-real-time-gating.md) | No real-time gating | Decided |
| [0003](0003-one-unresolved-adventure-per-player.md) | One unresolved adventure per player | Decided |
| [0004](0004-graphql-service-is-the-only-api.md) | The GraphQL service is the only API for core requests | Working assumption |
| [0005](0005-adventure-records-outside-postgres.md) | Adventure records and replays live outside Postgres | Working assumption |
| [0006](0006-rds-postgres-not-aurora.md) | RDS Postgres, not Aurora | Working assumption |
| [0007](0007-canned-actions-not-free-text.md) | Canned actions, not free-text chat | Decided |
| [0008](0008-terraform-state-backend.md) | Terraform state in one S3 bucket in heat-platform, native locking, SSE-S3, account id as a variable | Decided |
| [0009](0009-local-development-environment.md) | Local development against containers and serverless-offline; real AWS only through the pipeline | Decided |
| [0010](0010-front-doors.md) | API Gateway fronts the API, CloudFront the client; no load balancer; domains per environment | Decided |
| [0011](0011-deployments-and-the-prod-gate.md) | Code through the pipeline, infrastructure through Terraform, prod behind a version tag | Decided |
