# The environment module

One HEAT environment: the two tables, the replay bucket, one function per entry in `manifest.json` with its code, role, two aliases and log group, the HTTP API with its JWT authorizer, routes, throttled stage and access log, the site on the environment's hostname (`terraform/modules/site`, composed here), and the stack's parameters. Composed by `terraform/environment/sandbox` for every per-issue stack (Issue-38), by the `dev` root beside the `base` module (Issue-40, applied 2026-10-18) and by the `prod` root the same way, without a `ci` client (Issue-41). Design: `docs/architecture/overview.md`, "Services and data" and "Environments"; decisions 0012, 0013, 0017, 0018, 0023.

## What it creates

| Resource | Name | Notes |
| --- | --- | --- |
| Table | `<prefix>-player` | Partitioned by player; private. `PK`, `SK` strings, on-demand (decision 0023) |
| Table | `<prefix>-location` | Partitioned by location and by adventure; public. Same schema |
| Bucket | `<prefix>-replays` | One timeline per settled adventure, `<adventureId>.json`, written once by the hub with `If-None-Match` and read back through it (`replays.tf`, Issue-114). Public access blocked, no ACLs, SSE-S3, no versioning, a policy that denies any request not made over TLS; `force_destroy` only where deletion protection is off, so a sandbox stack's destroy empties it and `dev`'s or `prod`'s refuses to |
| Function, per manifest entry | `<prefix>-<name>` | `nodejs24.x`, arm64, memory and timeout from the manifest, `publish`, active tracing, environment variables `HEAT_PLAYER_TABLE`, `HEAT_LOCATION_TABLE`, `POWERTOOLS_SERVICE_NAME`, `POWERTOOLS_LOG_LEVEL`, `POWERTOOLS_METRICS_NAMESPACE`, the prefix, so that each stack has its own (decision 0040), `HEAT_VERSION`, the deploy's version from `app_version`, which changes with every commit, so every deploy publishes a version and moves the alias (decision 0030), `HEAT_PREVIOUS_VERSION`, the version the `previous` alias runs, and `HEAT_REPLAY_BUCKET` |
| Alias | `live` | At the function's latest version; what the routes invoke unless they name `previous`. Rollback moves it back (decision 0017) |
| Alias | `previous` | The deploy before the current one, which verifies the adventures it issued (decision 0030; `previous.tf`, below) |
| Execution role | `<prefix>-<name>` | Under the account's boundary. Its own log group, the item operations on the two tables, `s3:PutObject` and `s3:GetObject` on the replay bucket's objects, X-Ray writes. Nothing else |
| Log group | `/aws/lambda/<prefix>-<name>` | Created before the function, with retention |
| HTTP API | `<prefix>-api` | The manifest's routes, each `JWT`-authorized and integrated with the alias it names, `live` by default: `POST` and `GET /graphql` at `live`, `POST /previous/graphql` at `previous`, each alias with its own integration and invoke permission; `$default` stage, auto-deployed, throttled; access log to `/aws/apigateway/<prefix>-api` |
| Authorizer | `cognito` | Issuer `https://cognito-idp.<region>.amazonaws.com/<pool id>`, the browser client below and, where the base has one, its `ci` client (`prod` has none, so one audience); `aud` or `client_id` must match (API Gateway developer guide, read 2026-10-17) |
| Browser app client | `<prefix>-browser` | In the shared pool (`sign_in.tf`, decision 0024): public, the code grant with PKCE, scopes `openid email profile`, Google as its provider and, where the root sets `password_sign_in` (a sandbox stack, Issue-86), the pool's own users beside it, callback and sign-out URLs `https://<hostname>` plus the root's `extra_callback_urls` (`http://localhost:4200` in a sandbox stack, none in `dev` and `prod`), access and ID tokens of one hour, a refresh token of 30 days with rotation and a ten-second grace period, revocation on |
| Managed login style | for that client | Cognito's provided values; a client created through the API has none until one is created |
| Site | `<hostname>` | The site module: the client bucket, the distribution serving it and sending the manifest's route paths (`/graphql`, `/previous/graphql`) to the HTTP API above, the hostname's records in the base's zone (its README) |
| Parameters | `/heat/<prefix>/site_url`, `api_url`, `user_pool_id`, `browser_client_id`, `login_host`, and `app_client_id` where the base has a `ci` client (not in `prod`) | The stack's public facts, for whatever calls it; the API path, the pool, the browser client and the login host also reach the browser as `config.json` |
| Topic, where `alarm_email` is set | `<prefix>-alarms` | SNS, with one `email` subscription to the root's address (`alarms.tf`, Issue-40). The owner confirms the subscription once from the mail SNS sends; the provider neither waits for that nor can delete an unconfirmed subscription |
| Alarms, per function, where `alarm_email` is set | `<prefix>-<name>-errors`, `-throttles`, `-duration` | `AWS/Lambda` by `FunctionName`: `Errors` sum ≥ 1 in one five-minute period; `Throttles` sum ≥ 1 in one one-minute period; `Duration` p95 ≥ half the manifest's timeout in two of three five-minute periods. Missing data is not breaching; alarm and OK both notify the topic |
| Alarm, where `alarm_email` is set | `<prefix>-hub-conflicts-answered` | The hub's `ConflictAnswered`, namespace `<prefix>`, `service = heat-hub`, Sum ≥ 1 in one five-minute period (decision 0040) |
| Alarms, per table, where `alarm_email` is set | `<prefix>-<table>-transaction-conflicts`, `-failed-conditions` | `AWS/DynamoDB` by `TableName`: `TransactionConflict` and `ConditionalCheckFailedRequests`, SampleCount ≥ 5 in one five-minute period; SampleCount because Sum counts each item of a transaction (decision 0040) |

Nothing here is provisioned capacity, a VPC, or a resource that costs money at rest; the eight standard-resolution alarms of one function and two tables are inside the ten alarm metrics CloudWatch's free tier lists (its pricing page, read 2026-11-03), the hub's own metrics are charged only for the hours they are sent, and the topic's emails are priced per message sent.

## The code

The root passes `dist_dir`, where `scripts/bundle.mjs` wrote `dist/<name>/index.mjs`. The module zips each directory with the `archive` provider, whose entries carry a fixed modification time (its changelog, 1.0.3), and passes the zip to the function as `filename` with `code_sha256` set to the zip's hash. The same bundle therefore gives the same hash on a laptop and on the runner, and a byte's difference shows in the plan as a code change; the pipeline's hash is the one that counts. The function is configured and created in the same plan as the tables it reads (decision 0017).

## The previous alias

Every deploy publishes a version and moves `live`; `previous` takes the version `live` had before (decision 0030). Terraform cannot read a resource's old value in its own configuration, so `previous.tf` reads it with data sources when it plans, by name, so nothing defers them to the apply:

1. `aws_lambda_functions`, the region's functions, says whether this one exists yet. On a stack's first apply it does not, and `previous` points at the new version with `live`.
2. `aws_lambda_function` with the qualifier `live` gives `live`'s version and its `HEAT_VERSION`. When that is another commit, `previous` takes `live`'s version.
3. When `live` already runs this commit, the apply is a re-run of the same deploy or a re-plan after it, and `aws_lambda_function` with the qualifier `previous` keeps `previous` where it is. Without this a re-run would move `previous` onto `live`, and a re-plan would never be clean.

The same read gives the function `HEAT_PREVIOUS_VERSION`, which is how a discard knows that the previous deploy could still verify an adventure. A version published before Issue-113 has no `HEAT_VERSION` and gives an empty value. One edge is left: a deploy that publishes its version and fails before `previous` exists, then re-runs with the same commit, fails its plan at step 3; the run says so, and no alias is ever wrong.

## Per-environment literals

| Variable | Sandbox stack | `dev` (Issue-40) | `prod` (Issue-41) |
| --- | --- | --- | --- |
| `log_retention_days` | 7 | 30 | 30 |
| `point_in_time_recovery` | false | true | true |
| `deletion_protection` | false | true | true |
| `throttling_rate_limit`, `throttling_burst_limit` | 10, 20 | 10, 20 | 10, 20 |
| `extra_callback_urls` | `["http://localhost:4200"]` | none | none |
| `alarm_email` | null | the `dev` environment's `HEAT_ALARM_EMAIL` | the `prod` environment's |
| `log_level` | INFO | INFO | INFO |

The throttle, under the account's Lambda concurrency, is the environment's kill switch for a runaway caller. Reserved concurrency per function is not used: Lambda keeps 100 unreserved executions per account, and `heat-sandbox`, `heat-dev` and `heat-prod` all have the new-account quota of 10 (read 2026-10-18), which is why `dev`'s and `prod`'s throttle is the sandbox's. The alarms (`alarms.tf`) are the permanent environments' only: an SNS topic the owner's address is subscribed to, three alarms per function on errors, throttles and duration, and the conflict alarms, with the thresholds in the table above, settled in the shape conversations of Issue-40 on 2026-10-18 and Issue-199 on 2026-11-03.

## What the root supplies

`name_prefix`, `functions` (from `manifest.json`), `dist_dir`, the base's `user_pool_id` and the `app_client_id` of its `ci` client (null where the base has none, as in `prod`), the `login_host` of the pool's managed login domain (`terraform/modules/login-domain`), the `hostname` with the base's `zone_id` and `certificate_arn` and the distribution's `price_class` (`PriceClass_100` everywhere today), `permissions_boundary_arn` built from the account id, `app_version`, the commit being deployed (`TF_VAR_app_version` from `github.sha` in the workflows, the worktree's `HEAD` on a laptop; a full 40-character hash, which the module checks), and the literals above. The module returns `app_version` and `password_sign_in` as outputs for `config.json`, and `replay_bucket` and `previous_versions` for reading back, so the client and the hub of one deploy carry one version. The module builds no ARN from an account id itself.

## Facts checked

All read on 2026-10-22, for Issue-114.

- **The Lambda data sources** (the provider's documentation, `d/lambda_function` and `d/lambda_functions`; its source, `internal/service/lambda/function_data_source.go`): `qualifier` is an "alias name or version number"; `version` and `environment` with its `variables` are exported; a function that does not exist is an error ("reading Lambda Function"), not an empty result; `aws_lambda_functions` lists the region's function names. The plan role's `ReadOnlyAccess` allows the `lambda:Get*` and `lambda:List*` they call.
- **Routes** (API Gateway developer guide, "Create routes for HTTP APIs"): a route is a method and a resource path, and a request's "full match for a route and method" is chosen before a greedy path or `$default`.
- **Conditional writes** (S3 user guide, "How to prevent object overwrites with conditional writes"): with `If-None-Match: *`, a write to a key that exists fails with `412 Precondition Failed`; of concurrent conditional writes "the first write operation to finish succeeds"; it needs `s3:PutObject` only; a `409 Conflict` comes from a delete racing the write.
- **TLS only** (Security Hub, control S3.5): a bucket policy that denies requests where `aws:SecureTransport` is false.
