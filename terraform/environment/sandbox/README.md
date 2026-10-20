# The sandbox stacks

One root for every per-issue sandbox stack in `heat-sandbox`: `heat-sb<issue>`, the environment module (`terraform/modules/environment`) with the sandbox's literals, on top of the base every stack shares (`terraform/environment/sandbox-base`). What tells one stack from another is the issue number from the branch name, which names the stack, its state key, `environment/sandbox/<issue>/terraform.tfstate`, and its hostname, `<issue>.heat-sb.dcg-games.com` (decision 0018, amending 0016 for this root only). History: Issue-38; the site, Issue-39.

**Status: the first stack with a site, `heat-sb39`, applied by the pipeline on 2026-10-17 late by the `Sandbox stacks` run on the push of Issue-39's second branch, under `sandbox-39`: 10 added on top of the 18 the branch's creation had applied from `main`, nothing changed or destroyed, the allow-list check passed, the apply three minutes and forty seconds with the distribution's deployment inside it; the client published; the stack test passed through `https://39.heat-sb.dcg-games.com` (the page, `config.json`, 401 without a token, the adventure loop with one, a cold start of 582 ms initialization plus 255 ms).** Read back the same night through `audit-heat-sandbox`: the distribution `Deployed` with the one alias, `PriceClass_100`, HTTP/2 and 3, IPv6, `index.html` as the root object, `TLSv1.2_2021` on SNI, the bucket origin behind the origin access control (`s3`, `sigv4`, `always`) and the API origin HTTPS only, the default behavior on `CachingOptimized` and `SecurityHeadersPolicy` with the viewer-request function and compression, the `/graphql` behavior on `CachingDisabled` and `AllViewerExceptHostHeader` with all seven methods, HTTPS only; the bucket with all four public-access blocks, SSE-S3, no versioning and the one policy statement conditioned on the distribution's ARN; five objects; the A and AAAA aliases in the base zone; the base certificate now `InUse` and renewal `ELIGIBLE`. From the laptop: `/` answers 200 with the five security headers and `max-age=60`, a hashed asset `max-age=31536000, immutable`, `/config.json` the two fields, a deep link the page, a missing asset 403, `GET` and anonymous `POST /graphql` 401, `http://` a 301 to `https://`. A re-plan from the laptop through the plan role after the apply: no changes. The earlier history of this root, `heat-sb38` (Issue-38, 18 added, read back 2026-10-17): the two tables with `PK` and `SK`, on-demand, no recovery and no deletion protection (`audit-heat-sandbox`); the function on `nodejs24.x`, arm64, 1024 MB, 10 s, tracing active, the four environment variables, version 1 behind the alias `live`; the role under `heat-sandbox-boundary` with its three statements; the API with the `cognito` JWT authorizer on the base pool and the `ci` client as audience, two `JWT` routes, the `$default` stage at 10 a second with a burst of 20 and its access log; both log groups at 7 days; the three parameters (`plan-heat-sandbox`). `POST /graphql` without a token and with a bad one both answer 401 from the authorizer. A re-plan from the laptop through the plan role after the apply: no changes, so the laptop's bundle hashes the same as the runner's. The owner then signed in as `player1` with the `ci` client and ran `startAdventure` and `settleAdventure` through the API (2026-10-17): three invocations in the log, the first a cold start of 627 ms initialization plus 234 ms, the warm ones 50 and 58 ms, each with its JSON request line and X-Ray trace, and the access log showing the earlier unauthenticated call refused with `token not provided`. `settleAdventure` answered null, as expected for a player with no profile item; the balances and ledger were written.

## Layout

| Path | Holds |
| --- | --- |
| `terraform/modules/environment/` | The resources |
| `terraform/modules/site/` | The site the environment module composes: the client bucket, the distribution on the hostname, the hostname's records |
| `terraform/environment/sandbox/` | This root: the backend block without a key, one provider for the sandbox account, the data sources that find the base's pool, `ci` client, zone and certificate by name, one module call with the sandbox's literals, the outputs, the lock file |
| `scripts/sandbox.mjs` | Derives the issue number from the branch and runs `init` with the key and `plan`, `apply`, `destroy`, `output` with the issue; counts stacks for the cap; lists orphans |
| `scripts/publish-client.sh`, `scripts/post-stack-url.sh` | After the apply: the client build and `config.json` (the API path, the pool, the browser client, the login host) into the bucket; the stack's URL as one comment on the branch's pull request |
| `.github/workflows/sandbox.yml` | Applies, publishes and tests on push, comments the URL when a pull request opens, destroys on branch deletion, sweeps weekly |

No flag is typed by a person: the script supplies the key and the issue, so the pair cannot mismatch.

## What a stack manages

In `heat-sandbox`, us-east-1, every resource tagged `Project=heat`, `Environment=sandbox`, `Stack=heat-sb<issue>`, `ManagedBy=terraform`: what the module README lists, with seven-day log retention, no point-in-time recovery, no deletion protection, a throttle of 10 requests a second with a burst of 20. The authorizer accepts the stack's own browser client and the base's `ci` client, so a player signs in with Google through the browser client (decision 0024) and the test users sign in with the password flow, through the `ci` client's API or, in a browser, with email and password on the managed login page, which a sandbox stack's browser client offers beside Google (`password_sign_in`, Issue-86). The site (`terraform/modules/site`): the bucket `heat-sb<issue>-client`, the distribution on `<issue>.heat-sb.dcg-games.com` with the base's certificate and `PriceClass_100`, serving the client and sending `/graphql` to the stack's API, and the hostname's A and AAAA records in the base zone. The browser client `heat-sb<issue>-browser` in the base pool with its managed login style, callback and sign-out URLs `https://<issue>.heat-sb.dcg-games.com` and `http://localhost:4200` (Issue-46).

What it reads from the base, by name: the pool `heat-sb-base-users` and its `ci` client, through `aws_cognito_user_pools` and `aws_cognito_user_pool_clients`; the zone `heat-sb.dcg-games.com` through `aws_route53_zone`; the issued certificate for that name through `aws_acm_certificate`; the managed login host, `https://auth.heat-sb.dcg-games.com`, derived from the zone name. Never the base's state.

## Who applies it

The pipeline, and nothing else, in `.github/workflows/sandbox.yml`:

- **On a push to a working branch** (`feat/**`, `fix/**`, `docs/**`, `infra/**`, `chore/**`, `hotfix/**`): the checks (typecheck, tests, schema currency), the bundle and the client's production build as artifacts; then, under the GitHub environment `sandbox-<issue>`, the apply role: the cap, `init` with the key, `plan`, the allow-list check, the plan in the job summary, `apply` of exactly that plan, which waits for the distribution to deploy; the client published into the bucket with `config.json` written from the outputs (`scripts/publish-client.sh`); the stack's URL in the summary, on the deployment and, when the branch has an open pull request, in one comment on it (`scripts/post-stack-url.sh`); then the stack test through the hostname: the stack's user `e2e-<issue>@heat-sb.dcg-games.com` minted in the base pool with a random password for that run (`scripts/e2e-user.sh`), `scripts/e2e.mjs` reading the page and `config.json`, which must say that password sign-in is offered, the managed login page answering for the browser client and the authorize endpoint handing off to Google, refused at `/graphql` without a token, then signing in through the `ci` client and running start, a refused second start, settle with the engine's rewards and a refused second settle, and the cold start read from the function's log into the summary (`scripts/report-cold-start.sh`).
- **When a pull request is opened or reopened**: the URL comment alone, from the issue number in the branch name, with no apply.
- **On the deletion of such a branch**: `main`'s copy of this root, the bundle (the root evaluates its hash even to destroy), `destroy` from the key, which empties the bucket and disables, then deletes, the distribution (minutes), `forget` of the empty state, and the deletion of the stack's test user, under `sandbox-<issue>`.
- **Weekly, and by hand with a dry run**: every stack whose branch is gone is destroyed, its state forgotten and its test user deleted, under `sandbox-sweep`.

The deletion and the schedule run `main`'s copy of the workflow, as GitHub does for those events, so they took effect when Issue-38 merged; before that, the throwaway branch's stack `heat-sb53` was left behind by its deletion and destroyed by the sweep dispatched from the branch (2026-10-17).

The account id reaches Terraform as `TF_VAR_workload_account_id` from the repository variable `HEAT_SANDBOX_ACCOUNT_ID`, and is replaced by `<account id>` in every plan the workflow writes.

**The cap.** `SANDBOX_STACK_CAP` in the workflow is 5. Before planning, the job counts the states under `environment/sandbox/` that hold resources, other than `base/` and this issue's own, and fails naming the stacks when the count is at the cap. A re-apply of an existing stack is never refused by it. A destroy leaves an empty state object behind, which the destroy paths remove with `forget`; the sweep lists every per-issue key without a branch, so an empty object left by an earlier run is forgotten too.

## Planning on a laptop

The agent plans a stack before pushing an infrastructure change (decision 0017, guardrail 5), through its `plan-heat-sandbox` profile, from the worktree, with the bundle built. In PowerShell:

```powershell
. C:\Users\chanc\IdeaProjects\HEAT\docs\private\heat-tfvars.ps1 -Environment sandbox
$env:AWS_PROFILE = "plan-heat-sandbox"
npm run bundle
node scripts/sandbox.mjs init
node scripts/sandbox.mjs plan -- -lock=false
```

`-lock=false` because the plan role may not write the lock file. The first plan of Issue-38, run this way on 2026-10-17: 18 to add, 0 to change, 0 to destroy.

## Verification

Every push verifies its own stack: the run summary shows the plan, the stack test's output, which now goes through the hostname and so proves the certificate, the records, both origins and the `Authorization` header crossing CloudFront, and the cold start. After a change to this root or a module, the agent also reads the account through `audit-heat-sandbox` and `plan-heat-sandbox` for what the test cannot see: the tables' settings, the role's statements, the stage's throttle, retention, the bucket's public access block and policy, the distribution's behaviors and policies, the objects' `Cache-Control`, and that nothing else was created.

## Lock file

`.terraform.lock.hcl` is committed, for Windows and Linux:

```powershell
terraform providers lock -platform=windows_amd64 -platform=linux_amd64
```
