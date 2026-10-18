# The dev environment

HEAT's first permanent application environment, `heat-dev.dcg-games.com` in the `heat-dev` account, in one root and one apply: the `base` module (the hosted zone, the certificate for the zone name and its wildcard, the account's one user pool with Google as its identity provider and its `ci` client), the `environment` module on top of it (the two tables, the function, the HTTP API, the site at the zone apex, the browser client, the alarms) and the `login-domain` module last (`auth.heat-dev.dcg-games.com`). Applied by the pipeline on every merge to `main`, followed by the smoke test (decisions 0016 as confirmed, 0017, 0018 as amended, 0020; the overview's "Environments"). History: Issue-40.

**Status: applied by the pipeline on 2026-10-18, by the `Deploy` run on the merge of Issue-40's pull request (PR-62), run 39117659052, under the `dev` GitHub environment: 47 added, nothing changed or destroyed, the allow-list check passed, the test-user step created both users, the client and `config.json` were published, and the smoke test passed.** The first apply and the delegation interleaved as "The first apply and the delegation" below describes: the run started at 10:02 UTC and the zone existed within 40 seconds; the agent read its four name servers through `audit-heat-dev` and the dcg-platform session wrote them into the parent zone (dcg-platform PR-40); the owner applied that at about 10:15 UTC, the delegation resolved publicly, the certificate was `ISSUED` by 10:17 UTC and the same run went on to the end. The apply step took 20 minutes 37 seconds, about fourteen of them the wait at the certificate's validation, and the whole run 22 minutes 44 seconds. The smoke test covered the page and `config.json`, the managed login page for dev's browser client, the hand-off to Google, 401 at `/graphql` without a token, then start and settle through `https://heat-dev.dcg-games.com` as `e2e@heat-dev.dcg-games.com`; the cold start was 344 ms of initialization and 132 ms for the first request, at 126 MB. The browser client's managed login branding style was created before the login domain existed, without complaint, which closes the question Issue-41 carried. Read back through `audit-heat-dev` at 10:35 UTC, and again at about 10:40 UTC for Issue-61's documentation pull request: both tables on-demand with deletion protection and point-in-time recovery on; both log groups at 30 days; the three alarms `heat-dev-hub-errors` (`Errors` sum ≥ 1 over one 300 s period), `heat-dev-hub-throttles` (`Throttles` sum ≥ 1 over one 60 s period) and `heat-dev-hub-duration` (`Duration` p95 ≥ 5000 ms in 2 of 3 periods of 300 s), all `OK`, missing data not breaching, one alarm and one OK action each; the topic `heat-dev-alarms` with its one `email` subscription, `PendingConfirmation` at 10:35 UTC and confirmed by the owner before the second read; the pool `heat-dev-base-users` on the Essentials tier with deletion protection, its custom domain `auth.heat-dev.dcg-games.com` `ACTIVE` on managed login version 2, the clients `heat-dev-browser` and `ci`, the provider `Google`, and beside `player1`, `player2` and `e2e` the owner's own Google-federated user, created at 10:32 UTC by the owner's sign-in at `https://heat-dev.dcg-games.com`, which proves the Google client is registered against the login domain; the stage throttled at 10 requests a second with a burst of 20; the zone with A and AAAA aliases at the apex, the validation CNAME and the `auth` A alias beside NS and SOA; the certificate `ISSUED`, in use and eligible for renewal; the bucket `heat-dev-client` with all four public-access blocks; the function `heat-dev-hub` on `nodejs24.x`, arm64, 1024 MB, 10 s, tracing active. From the laptop: `/` answers 200 with the security headers and `max-age=60`, `/config.json` carries its four fields, an anonymous `POST /graphql` is 401, a deep link is 200, `http://` is a 301 to `https://`, `https://auth.heat-dev.dcg-games.com/login` answers (400 without a client, as Cognito does), and `heat-dev.dcg-games.com` resolves publicly to the zone's four name servers. The custom domain's `/.well-known/openid-configuration` answers 404, as the sandbox's does; the pool's own issuer, `https://cognito-idp.us-east-1.amazonaws.com/<pool id>/.well-known/openid-configuration`, answers 200, and that is the document the browser client reads (decision 0024), so nothing is wrong. Re-plan through `plan-heat-dev` with the placeholder values of "Planning on a laptop": the only differences are the placeholders themselves, the Google provider's details and the subscription's address, and nothing else.

## Layout

| Path | Holds |
| --- | --- |
| `terraform/modules/base/` | The zone, the certificate, the pool with Google and the `ci` client |
| `terraform/modules/environment/` | The tables, the function with its role and alias, the API, the browser client, the site (`terraform/modules/site`), the parameters, the alarms |
| `terraform/modules/login-domain/` | The pool's custom domain for managed login and its alias record |
| `terraform/environment/dev/` | This root: the backend block with the key `environment/dev/terraform.tfstate`, one provider for the dev account, the three module calls with dev's literals, the outputs, `test-users.txt`, the lock file |
| `.github/workflows/deploy.yml` | Plans the root on every pull request to `main` under the `dev` environment and applies it on every merge, then publishes the client, creates the test users and runs the smoke test |

No flag selects an environment; the directory does (decision 0016). Unlike the sandbox account, where many stacks share one base in a root of its own, dev's base and environment are one root: there is one stack, so nothing to share and nothing to find by name.

## What it manages

In `heat-dev`, us-east-1, every resource tagged `Project=heat`, `Environment=dev`, `Stack=heat-dev`, `ManagedBy=terraform`:

- **The base**, `heat-dev-base`: the zone `heat-dev.dcg-games.com`, delegated from `dcg-games.com` by the organization layer after the first apply (below); the certificate for `heat-dev.dcg-games.com` and `*.heat-dev.dcg-games.com`, validated through the zone; the pool `heat-dev-base-users` (decision 0022) with Google registered through dev's own Google OAuth client and the `ci` password-flow client. Its test users, `player1@` and `player2@heat-dev.dcg-games.com`, are created by the apply job from `test-users.txt` and the `dev` environment's secret (decision 0020).
- **The environment**, `heat-dev`: what the module README lists, with thirty-day log retention, point-in-time recovery and deletion protection on both tables, a throttle of 10 requests a second with a burst of 20 (the account's Lambda concurrency is the new-account quota of 10, read 2026-10-18, and dev is its only stack), no extra callback URL on the browser client, and the alarms: the topic `heat-dev-alarms` with the owner's address subscribed, and per function an alarm on errors, throttles and duration. The site is the zone apex: the bucket `heat-dev-client`, the distribution on `heat-dev.dcg-games.com` with the base's certificate, and the apex A and AAAA aliases.
- **The login domain**, `auth.heat-dev.dcg-games.com`, created after the environment, because Cognito checks that the parent, `heat-dev.dcg-games.com`, has an A record, and that record is the site's.

## Variables

| Variable | From, in the pipeline | From, on a laptop |
| --- | --- | --- |
| `workload_account_id` | The repository variable `HEAT_DEV_ACCOUNT_ID` | The private script in `docs/private/`, or `terraform.tfvars` |
| `google_client_id` | The `dev` environment's variable `HEAT_GOOGLE_CLIENT_ID`, the client registered against `auth.heat-dev.dcg-games.com` | A placeholder |
| `google_client_secret` | The `dev` environment's secret `HEAT_GOOGLE_CLIENT_SECRET` (sensitive) | A placeholder |
| `alarm_email` | The `dev` environment's variable `HEAT_ALARM_EMAIL` | A placeholder |

One name per value in every environment; the environment supplies the value (decision 0020). Dev's values never cross a laptop, so a local plan uses placeholders and is a plan of the shape; the plan with real values is the pull request's, posted by the `Deploy` workflow, or the apply job's, in its run summary. The secret is sensitive as far as the plan is concerned: every plan the workflow writes shows the provider's details as `(sensitive value)`.

## Outputs

`zone_id`, `zone_name`, `zone_name_servers`, `user_pool_id`, `user_pool_name`, `ci_client_id`, `certificate_arn`, `login_host`, `browser_client_id`, `site_url`, `api_url`, `client_bucket`, `distribution_id`, `function_names`, `parameter_prefix`, `alarm_topic_arn`. None is secret and none carries the account id. The apply job reads `user_pool_id` for the test users, `client_bucket`, `user_pool_id`, `browser_client_id` and `login_host` for `config.json`, and `user_pool_name` and `zone_name` for the smoke test's user.

## Who applies it

The pipeline, and nothing else, in `.github/workflows/deploy.yml`, as the `dev` row of its matrix:

- **On a pull request to `main`**, under the `dev` GitHub environment with the plan role `heat-dev-plan`: the bundle, `init`, `plan -lock=false`, the allow-list check, and the plan in the job summary and in one comment on the pull request. A `pull_request_target` run executes `main`'s copy of the workflow, so the pull request that adds this row gets no plan for it; the first plan of this root with real values is the apply job's.
- **On a push to `main`**, under the same environment with the apply role `heat-dev-apply`: the bundle, the client's production build and the engine's build; `init`, `plan`, the allow-list check, the plan in the job summary, `apply` of exactly that plan; the test users; the client build and `config.json` published into the bucket (`scripts/publish-client.sh`); the site's URL in the job summary and on the deployment; the smoke test; the cold start from the function's log into the summary.

**The smoke test** is the stack test of decision 0018 run against dev (`scripts/e2e.mjs --stack heat-dev`): the page and `config.json` through `https://heat-dev.dcg-games.com`, the managed login page answering for dev's browser client and the authorize endpoint handing off to Google, 401 at `/graphql` without a token, then, signed in through the `ci` client as `e2e@heat-dev.dcg-games.com`, a user the job mints with a random password for the run and keeps between runs (`scripts/e2e-user.sh`), any adventure an earlier failed run left open settled first, then start, a refused second start, settle with the engine's rewards and a refused second settle. A failure fails the run. The user's records accumulate in dev's tables, one adventure per run, which is the cost of keeping one player instead of one per run.

**The owner's steps, once, before the pull request merges.** On the `dev` GitHub environment (it exists since Issue-12 with no policy): the branch policy `main`, the variables `HEAT_GOOGLE_CLIENT_ID` and `HEAT_ALARM_EMAIL`, the secrets `HEAT_GOOGLE_CLIENT_SECRET` and `HEAT_TEST_USER_PASSWORD`. In the Google Auth Platform, in the `HEAT` project Issue-46 created: a Web application client with the authorized JavaScript origin `https://auth.heat-dev.dcg-games.com` and the authorized redirect URI `https://auth.heat-dev.dcg-games.com/oauth2/idpresponse`; Google shows the secret once. And the `bootstrap` change that lets the apply role create the alarms' topic (`terraform/bootstrap/README.md`). The pull request's description carries these as task items.

## The first apply and the delegation

The certificate is validated by DNS through the zone, and the zone's four name servers are only known once it exists, so the first apply and the delegation interleave: the apply creates the zone within its first seconds, then waits at the certificate's validation (`aws_acm_certificate_validation`, the provider's default of 75 minutes); the agent reads the name servers through `audit-heat-dev` and hands the owner the dcg-platform step; when the delegation lands inside the window the same run completes, and when it does not the run fails at the waiter and the owner re-runs the failed job, which finishes from the state the first run left. ACM gives up on a validation after 72 hours. No toggle in the root and no second pull request, which is how the sandbox base was done in two issues (Issue-37, Issue-39).

After the first apply, the owner confirms the alarms' email subscription from the mail SNS sends (the provider neither waits for it nor can delete it unconfirmed), signs in with Google at `https://heat-dev.dcg-games.com` as the check that the Google client is registered against the right domain, and the status above is updated. All three happened on 2026-10-18 (Issue-61).

## Planning on a laptop

The agent plans this root before pushing an infrastructure change (decision 0017, guardrail 5), through its `plan-heat-dev` profile, from the worktree, with the bundle built and placeholders for the three values that never cross a laptop. In PowerShell:

```powershell
. C:\Users\chanc\IdeaProjects\HEAT\docs\private\heat-tfvars.ps1 -Environment dev
$env:AWS_PROFILE = "plan-heat-dev"
$env:TF_VAR_google_client_id = "000000000000-example.apps.googleusercontent.com"
$env:TF_VAR_google_client_secret = "GOCSPX-example"
$env:TF_VAR_alarm_email = "alarms@example.com"
npm run bundle
terraform -chdir=terraform/environment/dev init
terraform -chdir=terraform/environment/dev plan -lock=false
```

`-lock=false` because the plan role may not write the lock file. The plan shows the placeholder client id and the address in clear and the secret as sensitive; the pipeline's plan has the real ones.

## Verification

Every merge verifies dev through the smoke test and the cold start in the run summary. After a change to this root or a module, the agent also reads the account through `audit-heat-dev` and `plan-heat-dev` for what the test cannot see: the tables' recovery and deletion protection, the retention, the alarms and their topic, the role's statements, the stage's throttle, the bucket's public access block and policy, the distribution's behaviors, the pool, its domain and its clients, and that nothing else was created.

## Lock file

`.terraform.lock.hcl` is committed, for Windows and Linux, and is the sandbox root's: the same two providers at the same versions.

```powershell
terraform providers lock -platform=windows_amd64 -platform=linux_amd64
```
