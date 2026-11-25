# Decision records

One short record per significant decision: what was chosen, what was considered and not chosen, and why.

## Rules

1. Write a record when a choice is made between real alternatives and someone could later ask why.
2. Write a record when a disagreement still stands after the project owner has decided. See rule 4 in `docs/process/collaboration.md`.
3. A record is numbered with the next four-digit number and named `<number>-<short-title>.md`.
4. A record uses the sections Decision, Considered and not chosen, and Where it is described, and may add sections that serve the decision, such as Facts checked. Its status is **Decided** or **Working assumption**, with the same meaning as in the design documents.
5. A record is history and is not rewritten. When a decision changes, write a new record and change the old record's status to "Superseded by" the new number.
6. A record's Status and Date lines and its "Where it is described" section may be amended to point at a later record, at the issue that amended a detail, or at where the decision is now described; its Decision and "Considered and not chosen" sections are never changed (the review of PR-163, Issue-147).
7. The index's row is the record's title and its status word: Decided, Working assumption or Superseded by a number, with "amended" after it when the record's Status line says more. The amendments themselves are on the record's Status line and are not copied into the index, which is read whole to find one record (Issue-201; decision 0060).
8. A record's Decision or "Considered and not chosen" section that turns out wrong on a fact, while the decision stands, is corrected on its Status line, which quotes each sentence it corrects and says where the true statement now is; the sections stay as written. A decision that changes is a new record (rule 5; the review of PR-322, Issue-320).
9. An issue that amends a detail of a record adds a section of its own, `## Amendment: <what> (Issue-n, <date>)`, after the last amendment and before "Considered and not chosen", and names it on the Status line (rules 6 and 7). It may list what that issue weighed and did not choose. An amendment that replaces the record's Decision, rather than adding to it, is a new record (rule 5; the review of PR-334, Issue-205).
10. What a record decides is stated in its Decision section. "Considered and not chosen" says why a thing was not chosen and decides nothing (the review of PR-358, Issue-292).

## Why

The design and architecture documents say what is true now. They are edited as the design changes, so they lose the alternatives that were weighed along the way. The records keep those.

## Index

| Record | Decision | Status |
| --- | --- | --- |
| [0001](0001-adventures-run-in-the-browser.md) | Adventures run in the browser and are verified by the server | Decided |
| [0002](0002-no-real-time-gating.md) | No real-time gating | Decided |
| [0003](0003-one-unresolved-adventure-per-player.md) | One unresolved adventure per player | Decided, amended |
| [0004](0004-graphql-service-is-the-only-api.md) | The GraphQL service is the only API for core requests | Superseded by 0012 |
| [0005](0005-adventure-records-outside-postgres.md) | Adventure records and replays live outside Postgres | Superseded by 0013 |
| [0006](0006-rds-postgres-not-aurora.md) | RDS Postgres, not Aurora | Superseded by 0013 |
| [0007](0007-canned-actions-not-free-text.md) | Canned actions, not free-text chat | Decided |
| [0008](0008-terraform-state-backend.md) | Terraform state backend | Decided, amended |
| [0009](0009-local-development-environment.md) | Local development against containers, real AWS only through the pipeline | Decided, amended |
| [0010](0010-front-doors.md) | Front doors: API Gateway for the API, CloudFront for the client | Decided, amended |
| [0011](0011-deployments-and-the-prod-gate.md) | Deployments: code through the pipeline, infrastructure through Terraform, prod behind a tag | Decided, amended |
| [0012](0012-hub-is-typescript-on-lambda.md) | The hub is TypeScript on Lambda, with Apollo Server and Pothos | Decided, amended |
| [0013](0013-dynamodb-and-s3-only.md) | DynamoDB and S3 only: no relational store, no VPC | Decided, amended |
| [0014](0014-verification-in-the-submit-request.md) | Verification and settlement happen in the submit request | Decided |
| [0015](0015-domains-on-dcg-games-com.md) | Domains on dcg-games.com | Decided, amended |
| [0016](0016-one-root-per-environment.md) | One root directory per environment, shared local modules | Decided, amended |
| [0017](0017-pipeline-applies-terraform-and-owns-the-code.md) | The pipeline applies Terraform, and Terraform owns the function code | Decided, amended |
| [0018](0018-per-issue-sandbox-stacks.md) | Per-issue sandbox stacks in a dedicated account, one hostname per stack, the local emulator retired | Decided, amended |
| [0019](0019-bootstrap-for-the-pipeline.md) | Bootstrap for the pipeline: the boundary is an allow-list, a GitHub environment per stack, the agent's plan path | Decided, amended |
| [0020](0020-secrets-and-plans.md) | Secrets live in GitHub environments, enter AWS through a base root, and pull request plans run under the target environment | Decided, amended |
| [0021](0021-release-branch.md) | Production through a release branch; the tag is documentation; hotfixes from the start | Decided, amended |
| [0022](0022-shared-user-pool.md) | The shared user pool: Essentials tier, email as the username, administrator-created users, no MFA, administrator-only recovery, a password-flow CI client | Decided, amended |
| [0023](0023-two-tables-by-partition-key.md) | Two tables, named for their partition key: player and location | Decided, amended |
| [0024](0024-browser-sign-in.md) | Browser sign-in: managed login on a custom domain, the code grant with PKCE through oidc-client-ts, one public client per stack with rotating refresh tokens | Decided, amended |
| [0025](0025-ai-generated-assets.md) | AI-generated assets: PixelLab for pixel art, ElevenLabs for audio, generated by the agent through the owner's connectors and committed with their provenance | Decided, amended |
| [0026](0026-camps-heroes-and-the-build-order.md) | Camps, heroes and resources, and the camp ahead of the core loop | Decided, amended |
| [0027](0027-camp-art.md) | Camp art: a ground tileset and one sprite per facility, at one three-quarter angle | Decided |
| [0028](0028-pixijs-for-the-scene.md) | PixiJS draws the camp scene | Decided, amended |
| [0029](0029-heroes-seen-at-a-location.md) | The heroes seen at a location | Decided, amended |
| [0030](0030-the-first-adventure.md) | The first adventure: the engine, the marching order, stage time limits, and one version per deploy | Decided, amended |
| [0031](0031-the-first-progression.md) | The first progression: a first job a villager cannot fail, and one run per step | Decided, amended |
| [0032](0032-building-facilities.md) | Building facilities: by the level asked for, in one transaction, with the hall's and the warehouse's levels on the camp | Decided, amended |
| [0033](0033-three-layers-of-review.md) | Three layers of review: lint in CI, the review skill on a pull request, the checkup skill at a pause; the model-driven layers run from sessions on the subscription | Decided, amended |
| [0034](0034-checkup-findings-are-issues.md) | The checkup's findings are issues, and a closed `excused` issue is the suppression record | Decided, amended |
| [0035](0035-account-ids-as-repository-secrets.md) | The account ids reach the pipeline as repository secrets | Decided |
| [0036](0036-es-toolkit-and-known-libraries.md) | es-toolkit names the utility idioms, and a known library is preferred over our own | Decided |
| [0037](0037-plain-css-with-a-token-layer.md) | Plain CSS with a token layer the layout arithmetic reads | Decided |
| [0038](0038-errors-as-data.md) | Refusals as data in a result union per mutation, one input object per mutation, and the engine's sets as enums | Decided, amended |
| [0039](0039-zod-through-the-validation-plugin.md) | The contract's scalars and zod check every boundary, and the Pothos validation plugin is where zod runs on the API | Decided, amended |
| [0040](0040-metrics-through-powertools-and-middy.md) | Metrics through Powertools, with middy as the handler's middleware chain | Decided, amended |
| [0041](0041-electrodb-is-the-data-layer.md) | ElectroDB is the data layer | Decided, amended |
| [0042](0042-electrodb-the-rest-of-the-data-layer.md) | The rest of the data layer on ElectroDB, and how the backfill runs | Decided, amended |
| [0043](0043-owner-id-stored-served-through-a-scope.md) | An owner id may be stored in the location table and is served only through a scope; the hub reads no email, and a player's name is private | Decided |
| [0044](0044-angular-testing-library.md) | Angular Testing Library for the client's component specs | Decided |
| [0045](0045-playwright-browser-smoke-test.md) | A Playwright smoke test of the page on every stack, its trace encrypted to a committed certificate | Decided, amended |
| [0046](0046-downloaded-code-runs-in-a-job-with-no-role.md) | Downloaded code runs in a job that holds no role, and a test user's password crosses to it sealed | Decided, amended |
| [0047](0047-actions-locked-by-a-workflow-lockfile.md) | Every action runs at the commit a workflow lockfile records, and the composite actions are referenced as `$/` | Decided |
| [0048](0048-node-and-terraform-pinned-by-checksum.md) | Node and Terraform run at one exact release, checked against a pinned checksum, in every job | Decided, amended |
| [0049](0049-checkup-findings-in-batches.md) | The checkup files its findings in batches, one per fixing pull request, and few candidates earn a rule | Decided |
| [0050](0050-recent-adventures-and-replays-by-job.md) | Recent adventures as a feed item, replays by job as one sparse index | Decided, amended |
| [0051](0051-resource-nodes-as-obstacles.md) | Resource nodes as obstacles: health, a difficulty and a maximum yield, harvested by a gather rating per resource | Decided, amended |
| [0052](0052-ranged-units-and-the-projectile.md) | Ranged units: an attack that reaches every line, a shot that hits a node last, and a projectile let go at the hold frame | Decided, amended |
| [0053](0053-replays-answer-the-adventure.md) | A job's replays answer the adventure itself, and the index is keyed from an attribute only settlement sets | Decided |
| [0054](0054-npm-scripts-without-a-prompt.md) | The repository's npm scripts run in an issue's worktree without a prompt, through a committed hook that is a convenience and not a boundary | Decided, amended |
| [0055](0055-tracing-through-opentelemetry.md) | Tracing through OpenTelemetry: AWS's Lambda layer, the AWS SDK beside the bundle, and a span for each root field | Decided |
| [0056](0056-the-trace-report.md) | The trace report: what each request did, read in review beside the cold start | Decided |
| [0057](0057-the-clock-pauses-while-an-action-is-animated.md) | The play clock pauses while an action is animated, and the whole of an action plays as it resolves | Decided, amended |
| [0058](0058-drops-by-trait-and-jobs-that-vary.md) | What an adventure yields: drops by gathering trait, enemy XP, and jobs that vary | Decided, amended |
| [0059](0059-unlocks-caravans-and-highcrag.md) | More locations: general unlocks, caravans with a cart, and Highcrag | Decided, amended |
| [0060](0060-what-a-session-costs.md) | What a session costs: a compaction window, rules kept apart from their accounts, and a size for what every session loads | Decided, amended |
