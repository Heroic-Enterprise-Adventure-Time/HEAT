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
| [0004](0004-graphql-service-is-the-only-api.md) | The GraphQL service is the only API for core requests | Superseded by 0012 |
| [0005](0005-adventure-records-outside-postgres.md) | Adventure records and replays live outside Postgres | Superseded by 0013 |
| [0006](0006-rds-postgres-not-aurora.md) | RDS Postgres, not Aurora | Superseded by 0013 |
| [0007](0007-canned-actions-not-free-text.md) | Canned actions, not free-text chat | Decided |
| [0008](0008-terraform-state-backend.md) | Terraform state in one S3 bucket in heat-platform, native locking, SSE-S3, account id as a variable | Decided; the identity that applies amended by 0017; "no secrets in state" amended by 0020 |
| [0009](0009-local-development-environment.md) | Local development against containers and serverless-offline; real AWS only through the pipeline | Decided; the local run of the system superseded by 0018, the Testcontainers rule stays |
| [0010](0010-front-doors.md) | API Gateway fronts the API, CloudFront the client; no load balancer; domains per environment | Decided; domains amended by 0015, VPC link moot per 0012, one hostname per environment per 0018 |
| [0011](0011-deployments-and-the-prod-gate.md) | Code through the pipeline, infrastructure through Terraform, prod behind a version tag | Decided; two-paths rule superseded by 0017, OIDC stays; prod gate amended by 0021; artifact list amended by 0012 |
| [0012](0012-hub-is-typescript-on-lambda.md) | The hub is TypeScript on Lambda, with Apollo Server and Pothos | Decided |
| [0013](0013-dynamodb-and-s3-only.md) | DynamoDB and S3 only: no relational store, no VPC | Decided |
| [0014](0014-verification-in-the-submit-request.md) | Verification and settlement happen in the submit request | Decided |
| [0015](0015-domains-on-dcg-games-com.md) | Domains on dcg-games.com | Decided; one hostname per environment per 0018 |
| [0016](0016-one-root-per-environment.md) | One root directory per environment, shared local modules | Decided; ephemeral stacks share one root per 0018; dev and prod roots compose the base and environment modules (2026-10-17) |
| [0017](0017-pipeline-applies-terraform-and-owns-the-code.md) | The pipeline applies Terraform, and Terraform owns the function code; bounded apply roles; the owner applies only bootstrap | Decided; boundary shape, sandbox environment and one fact amended by 0019; the plan job's identity by 0020; the prod trigger by 0021 |
| [0018](0018-per-issue-sandbox-stacks.md) | Per-issue sandbox stacks in heat-sandbox, one hostname per stack behind CloudFront, the local emulator retired | Decided; the sandbox GitHub environment per 0019; the prod environment's policy per 0021; see its status line for the 2026-10-17 amendments |
| [0019](0019-bootstrap-for-the-pipeline.md) | Bootstrap for the pipeline: the boundary is an allow-list with denies, a GitHub environment per stack, the agent's plan path, one state prefix per account | Decided; the plan role's trust and the user-record carve-out amended by 0020 |
| [0020](0020-secrets-and-plans.md) | Secrets live in GitHub environments, enter AWS through a base root, and pull request plans run under the target environment | Decided |
| [0021](0021-release-branch.md) | Production through a release branch; the tag is documentation; hotfixes from the start | Decided |
| [0022](0022-shared-user-pool.md) | The shared user pool: Essentials tier, email as the username, administrator-created users, no MFA, administrator-only recovery, a password-flow CI client | Decided |
| [0023](0023-two-tables-by-partition-key.md) | Two tables named for their partition key, player and location, prefixed in every environment | Decided |
| [0024](0024-browser-sign-in.md) | Browser sign-in: managed login on a custom domain, the code grant with PKCE through oidc-client-ts, one public client per stack with rotating refresh tokens | Decided |
| [0025](0025-ai-generated-assets.md) | AI-generated assets: PixelLab for pixel art, ElevenLabs for audio, generated by the agent through the owner's connectors and committed with their provenance | Decided; the hero sprite set's cost and checks amended 2026-10-19 (Issue-73) |
| [0026](0026-camps-heroes-and-the-build-order.md) | Camps are a player's view of a fixed location; heroes per camp under the hall's cap, with a free villager; resources per camp and no currency; the camp and hero keys; the camp ahead of the core loop | Decided |
