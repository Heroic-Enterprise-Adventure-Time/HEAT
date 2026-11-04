# Decision records

One short record per significant decision: what was chosen, what was considered and not chosen, and why.

## Rules

1. Write a record when a choice is made between real alternatives and someone could later ask why.
2. Write a record when a disagreement still stands after the project owner has decided. See rule 4 in `docs/process/collaboration.md`.
3. A record is numbered with the next four-digit number and named `<number>-<short-title>.md`.
4. A record uses the sections Decision, Considered and not chosen, and Where it is described, and may add sections that serve the decision, such as Facts checked. Its status is **Decided** or **Working assumption**, with the same meaning as in the design documents.
5. A record is history and is not rewritten. When a decision changes, write a new record and change the old record's status to "Superseded by" the new number.
6. A record's Status and Date lines and its "Where it is described" section may be amended to point at a later record, at the issue that amended a detail, or at where the decision is now described; its Decision and "Considered and not chosen" sections are never changed. From the review of PR-163 (Issue-147), which found the practice of 0008 to 0033 in no rule.
7. The index's status column follows the record's status line: an amendment to one is made to both. From the review of PR-214 (Issue-201).

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
| [0012](0012-hub-is-typescript-on-lambda.md) | The hub is TypeScript on Lambda, with Apollo Server and Pothos | Decided; built, the generated client and Apollo Angular last, by Issue-156 |
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
| [0023](0023-two-tables-by-partition-key.md) | Two tables named for their partition key, player and location, prefixed in every environment | Decided; the keys are written through ElectroDB's templates per 0041 |
| [0024](0024-browser-sign-in.md) | Browser sign-in: managed login on a custom domain, the code grant with PKCE through oidc-client-ts, one public client per stack with rotating refresh tokens | Decided |
| [0025](0025-ai-generated-assets.md) | AI-generated assets: PixelLab for pixel art, ElevenLabs for audio, generated by the agent through the owner's connectors and committed with their provenance | Decided; the hero sprite set's cost and checks amended 2026-10-19 (Issue-73) |
| [0026](0026-camps-heroes-and-the-build-order.md) | Camps are a player's view of a fixed location; heroes per camp under the hall's cap, with a free villager; resources per camp and no currency; the camp and hero keys; the camp ahead of the core loop | Decided; the keys are written through ElectroDB's templates per 0041 |
| [0027](0027-camp-art.md) | Camp art: a 16 px ground tileset without an outline, one sprite per facility on a whole-tile canvas, one three-quarter angle, levels that keep the canvas | Decided |
| [0028](0028-pixijs-for-the-scene.md) | PixiJS 8 draws the 320×180 camp scene inside the Angular page, scaled by whole numbers and loaded after sign-in; particles and sound chosen when needed | Decided |
| [0029](0029-heroes-seen-at-a-location.md) | The heroes seen at a location: one item per hero under the location, public fields and no owner, a week's TTL, written by the flows that change a hero, sampled six from a bounded read of twenty | Decided; identifiers on the item per 0041 |
| [0030](0030-the-first-adventure.md) | The first adventure: the battle engine adapted from BattleScript Online with one fixed action list per unit type, a marching order of four lines that collapse, stage time limits that force a retreat, and one version per deploy with the previous deploy kept live to verify what it issued | Decided |
| [0031](0031-the-first-progression.md) | The first progression: "Pick up sticks", a first job a lone villager cannot fail, then one run per step: a villager for 20 timber, the mine for 60 timber and 3 cloth, a fighter for 40 ore; building is instant | Decided |
| [0032](0032-building-facilities.md) | Building facilities: one mutation naming the level being built, one transaction with the level, the prerequisites and the debits as conditions, the hall's and the warehouse's levels on the camp's item, and the first costs and caps | Decided |
| [0033](0033-three-layers-of-review.md) | Three layers of review: lint in CI, the review skill on a pull request from a session of its own with findings as threads, the checkup skill at a pause; the model-driven layers run from sessions on the subscription, never in GitHub Actions or through an API key | Decided; the checkup's surface in 0034 |
| [0034](0034-checkup-findings-are-issues.md) | The checkup's findings are issues labeled `finding`, one per breach, capped per run; a closed issue labeled `excused` is the suppression record; candidate rules go to the owner in the session and are filed when accepted | Decided |
| [0035](0035-account-ids-as-repository-secrets.md) | The four AWS account ids reach the workflows as repository secrets, never variables, so that GitHub masks them in every log line; where a matrix row decides the account, the job's first step picks the secret and refuses to run without it | Decided |
| [0036](0036-es-toolkit-and-known-libraries.md) | es-toolkit names the utility idioms in the engine, the hub and the client; for a common problem a popular, current library is preferred over a solution of our own, adopted whole, exact-pinned and named in the standards | Decided |
| [0037](0037-plain-css-with-a-token-layer.md) | The client's styles are plain CSS with a token layer on `:root`, and the layout arithmetic reads the regions' sizes from the tokens at runtime instead of holding pixel copies | Decided |
| [0038](0038-errors-as-data.md) | Refusals as data in a result union per mutation, one input object per mutation, every root field nullable, `ID` and `DateTime` scalars, the engine's closed sets as `UPPER_CASE` enums mapped to the engine's strings at the hub and the client's boundary | Decided; the client's mapping amended by Issue-156, the request id's scalar by 0039 |
| [0039](0039-zod-through-the-validation-plugin.md) | The contract's scalars and zod check every boundary: `UUID`, `NonNegativeInt`, `PositiveInt` and `JSON` from `graphql-scalars`, zod through `@pothos/plugin-validation` for the rest, and for the environment and `config.json`, spelled `zod/mini` | Decided; the replay bucket's check moved by Issue-206 |
| [0040](0040-metrics-through-powertools-and-middy.md) | The hub's metrics through Powertools as embedded metric format lines, middy hosting the three Powertools middlewares, and conflict alarms on the hub and the tables; a filter on the warning line, `PutMetricData` and no middy not chosen | Decided |
| [0041](0041-electrodb-is-the-data-layer.md) | ElectroDB is the data layer behind the repository: one service over the two tables, key templates reproducing `keys.ts`, the identifiers kept and backfilled once the previous route is on it, the camps a raw `Query` by prefix rather than a collection; recruit and retire first, the rest in Issue-201 | Decided; every method moved by Issue-201, the migration plan amended by 0042 |
| [0042](0042-electrodb-the-rest-of-the-data-layer.md) | The rest of the data layer on ElectroDB: the record's snapshot and result stored whole, the backfill a step after every apply until Issue-213, its condition and a raw read's one page corrected | Decided |
