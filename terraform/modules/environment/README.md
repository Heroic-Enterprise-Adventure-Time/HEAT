# The environment module

One HEAT environment: the two tables, one function per entry in `manifest.json` with its code, role, alias and log group, the HTTP API with its JWT authorizer, routes, throttled stage and access log, and the stack's parameters. Composed by `terraform/environment/sandbox` for every per-issue stack (Issue-38) and, from Issue-40 and Issue-41, by the `dev` and `prod` roots beside the `base` module. Design: `docs/architecture/overview.md`, "Services and data" and "Environments"; decisions 0012, 0013, 0017, 0018, 0023.

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
| Authorizer | `cognito` | Issuer `https://cognito-idp.<region>.amazonaws.com/<pool id>`, audience the app client id; `aud` or `client_id` must match (API Gateway developer guide, read 2026-10-17) |
| Parameters | `/heat/<prefix>/api_url`, `user_pool_id`, `app_client_id` | The stack's public facts, for whatever calls it |

Nothing here is provisioned capacity, a VPC, or a resource that costs money at rest.

## The code

The root passes `dist_dir`, where `scripts/bundle.mjs` wrote `dist/<name>/index.mjs`. The module zips each directory with the `archive` provider, whose entries carry a fixed modification time (its changelog, 1.0.3), and passes the zip to the function as `filename` with `code_sha256` set to the zip's hash. The same bundle therefore gives the same hash on a laptop and on the runner, and a byte's difference shows in the plan as a code change; the pipeline's hash is the one that counts. The function is configured and created in the same plan as the tables it reads (decision 0017).

## Per-environment literals

| Variable | Sandbox stack | `dev`, `prod` (set by their issues) |
| --- | --- | --- |
| `log_retention_days` | 7 | longer |
| `point_in_time_recovery` | false | true |
| `deletion_protection` | false | true |
| `throttling_rate_limit`, `throttling_burst_limit` | 10, 20 | theirs |
| `log_level` | INFO | INFO |

The throttle, under the account's Lambda concurrency, is the environment's kill switch for a runaway caller. Reserved concurrency per function is not used: Lambda keeps 100 unreserved executions per account, and `heat-sandbox` has the new-account quota of 10. No alarms: they arrive with `dev` (Issue-40), the first environment with somewhere to send them.

## What the root supplies

`name_prefix`, `environment`, `functions` (from `manifest.json`), `dist_dir`, the base's `user_pool_id` and the `app_client_id` whose tokens the authorizer accepts, `permissions_boundary_arn` built from the account id, and the literals above. The module builds no ARN from an account id itself.
