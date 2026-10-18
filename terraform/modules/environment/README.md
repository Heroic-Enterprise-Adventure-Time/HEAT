# The environment module

One HEAT environment: the two tables, one function per entry in `manifest.json` with its code, role, alias and log group, the HTTP API with its JWT authorizer, routes, throttled stage and access log, the site on the environment's hostname (`terraform/modules/site`, composed here), and the stack's parameters. Composed by `terraform/environment/sandbox` for every per-issue stack (Issue-38), by the `dev` root beside the `base` module (Issue-40, applied 2026-10-18) and, from Issue-41, by the `prod` root the same way. Design: `docs/architecture/overview.md`, "Services and data" and "Environments"; decisions 0012, 0013, 0017, 0018, 0023.

## What it creates

| Resource | Name | Notes |
| --- | --- | --- |
| Table | `<prefix>-player` | Partitioned by player; private. `PK`, `SK` strings, on-demand (decision 0023) |
| Table | `<prefix>-location` | Partitioned by location and by adventure; public. Same schema |
| Function, per manifest entry | `<prefix>-<name>` | `nodejs24.x`, arm64, memory and timeout from the manifest, `publish`, active tracing, environment variables `HEAT_PLAYER_TABLE`, `HEAT_LOCATION_TABLE`, `POWERTOOLS_SERVICE_NAME`, `POWERTOOLS_LOG_LEVEL` |
| Alias | `live` | At the function's latest version; what the routes invoke. Rollback moves it back (decision 0017) |
| Execution role | `<prefix>-<name>` | Under the account's boundary. Its own log group, the item operations on the two tables, X-Ray writes. Nothing else |
| Log group | `/aws/lambda/<prefix>-<name>` | Created before the function, with retention |
| HTTP API | `<prefix>-api` | The manifest's routes, each `JWT`-authorized; `$default` stage, auto-deployed, throttled; access log to `/aws/apigateway/<prefix>-api` |
| Authorizer | `cognito` | Issuer `https://cognito-idp.<region>.amazonaws.com/<pool id>`, two audiences, the base's `ci` client and the browser client below; `aud` or `client_id` must match (API Gateway developer guide, read 2026-10-17) |
| Browser app client | `<prefix>-browser` | In the shared pool (`sign_in.tf`, decision 0024): public, the code grant with PKCE, scopes `openid email profile`, Google as its only provider, callback and sign-out URLs `https://<hostname>` plus the root's `extra_callback_urls` (`http://localhost:4200` in a sandbox stack, none in `dev` and `prod`), access and ID tokens of one hour, a refresh token of 30 days with rotation and a ten-second grace period, revocation on |
| Managed login style | for that client | Cognito's provided values; a client created through the API has none until one is created |
| Site | `<hostname>` | The site module: the client bucket, the distribution serving it and sending the manifest's route paths (`/graphql`) to the HTTP API above, the hostname's records in the base's zone (its README) |
| Parameters | `/heat/<prefix>/site_url`, `api_url`, `user_pool_id`, `app_client_id`, `browser_client_id`, `login_host` | The stack's public facts, for whatever calls it; the last four also reach the browser as `config.json` |
| Topic, where `alarm_email` is set | `<prefix>-alarms` | SNS, with one `email` subscription to the root's address (`alarms.tf`, Issue-40). The owner confirms the subscription once from the mail SNS sends; the provider neither waits for that nor can delete an unconfirmed subscription |
| Alarms, per function, where `alarm_email` is set | `<prefix>-<name>-errors`, `-throttles`, `-duration` | `AWS/Lambda` by `FunctionName`: `Errors` sum ≥ 1 in one five-minute period; `Throttles` sum ≥ 1 in one one-minute period; `Duration` p95 ≥ half the manifest's timeout in two of three five-minute periods. Missing data is not breaching; alarm and OK both notify the topic |

Nothing here is provisioned capacity, a VPC, or a resource that costs money at rest; three standard-resolution alarms are inside the ten alarm metrics CloudWatch's free tier lists (its pricing page, read 2026-10-18), and the topic's emails are priced per message sent.

## The code

The root passes `dist_dir`, where `scripts/bundle.mjs` wrote `dist/<name>/index.mjs`. The module zips each directory with the `archive` provider, whose entries carry a fixed modification time (its changelog, 1.0.3), and passes the zip to the function as `filename` with `code_sha256` set to the zip's hash. The same bundle therefore gives the same hash on a laptop and on the runner, and a byte's difference shows in the plan as a code change; the pipeline's hash is the one that counts. The function is configured and created in the same plan as the tables it reads (decision 0017).

## Per-environment literals

| Variable | Sandbox stack | `dev` (Issue-40) | `prod` (set by Issue-41) |
| --- | --- | --- | --- |
| `log_retention_days` | 7 | 30 | longer |
| `point_in_time_recovery` | false | true | true |
| `deletion_protection` | false | true | true |
| `throttling_rate_limit`, `throttling_burst_limit` | 10, 20 | 10, 20 | theirs |
| `extra_callback_urls` | `["http://localhost:4200"]` | none | none |
| `alarm_email` | null | the `dev` environment's `HEAT_ALARM_EMAIL` | the `prod` environment's |
| `log_level` | INFO | INFO | INFO |

The throttle, under the account's Lambda concurrency, is the environment's kill switch for a runaway caller. Reserved concurrency per function is not used: Lambda keeps 100 unreserved executions per account, and both `heat-sandbox` and `heat-dev` have the new-account quota of 10 (read 2026-10-18), which is why `dev`'s throttle is the sandbox's. The alarms (`alarms.tf`) are the permanent environments' only: an SNS topic the owner's address is subscribed to, and three alarms per function on errors, throttles and duration, with the thresholds in the table above, settled in Issue-40's shape conversation on 2026-10-18.

## What the root supplies

`name_prefix`, `environment`, `functions` (from `manifest.json`), `dist_dir`, the base's `user_pool_id` and the `app_client_id` of its `ci` client, the `login_host` of the pool's managed login domain (`terraform/modules/login-domain`), the `hostname` with the base's `zone_id` and `certificate_arn` and the distribution's `price_class` (`PriceClass_100` everywhere today), `permissions_boundary_arn` built from the account id, and the literals above. The module builds no ARN from an account id itself.
