# The prod environment

HEAT's production environment, `heat.dcg-games.com` in the `heat-prod` account, in one root and one apply, the shape of the `dev` root: the `base` module (the hosted zone, the certificate for the zone name and its wildcard, the account's one user pool with Google as its identity provider), the `environment` module on top of it (the two tables, the function, the HTTP API, the site at the zone apex, the browser client, the alarms) and the `login-domain` module last (`auth.heat.dcg-games.com`). Applied by the pipeline on every merge to `release`, through the release pull request, followed by the smoke test, the tag and the GitHub Release (decisions 0016 as confirmed, 0017, 0018 as amended, 0020, 0021 as amended; the overview's "Environments"). History: Issue-41.

**Status: applied by the pipeline on 2026-10-18, by the `Release` run on the merge of the first release pull request (PR-67, `main` to `release`, merged at 636218e), run 39128402103, under the `prod` GitHub environment: 45 added, nothing changed or destroyed, the allow-list check passed, the client and `config.json` were published, the anonymous smoke test passed, and the tag `v2026.10.18` and its GitHub Release were written by the workflow's token.** The first release and the delegation interleaved as "The first release and the delegation" below describes: the run started at 12:42 UTC and the zone existed within a minute; the agent read its four name servers through `audit-heat-prod` and the dcg-platform session wrote them into the parent zone (dcg-platform PR-41); the owner applied that before 12:56 UTC, the delegation resolved publicly, the certificate was `ISSUED` at 12:57 UTC and the same run went on to the end at 13:04 UTC. The apply step took 20 minutes 57 seconds, most of it the wait at the certificate's validation, and the whole run 22 minutes 35 seconds. The smoke test covered the page and `config.json`, the managed login page for the browser client at `auth.heat.dcg-games.com`, the hand-off to Google and 401 at `/graphql` without a token; nothing signed in and nothing was written. The release pull request's guard failed on its first run, because the job ran `release`'s copy of `scripts/check-release-source.sh` and `release`, cut before Issue-41's merge, did not have it; PR-68 made the guard run `main`'s copy, and the second run passed. Read back through `audit-heat-prod` at about 13:40 UTC: both tables on-demand with deletion protection and point-in-time recovery on; the log group `/aws/lambda/heat-prod-hub` at 30 days; the three alarms `heat-prod-hub-errors`, `heat-prod-hub-throttles` and `heat-prod-hub-duration`, all `OK`, each with the topic `heat-prod-alarms` as its action; the topic's one `email` subscription, `PendingConfirmation` at 13:47 UTC and confirmed by the owner at about 22:10 UTC, read back as confirmed at 22:12 UTC (Issue-64); the pool `heat-prod-base-users` on the Essentials tier with deletion protection, its custom domain `auth.heat.dcg-games.com` `ACTIVE` on managed login version 2, the one client `heat-prod-browser` with the SRP flow, the code grant, the callback `https://heat.dcg-games.com` and Google as its only provider, no `ci` client, the provider `Google`, and one user: the owner's own Google-federated user, created at 13:04:53 UTC by the owner's sign-in at `https://heat.dcg-games.com`, twenty seconds after the client was published, which proves the Google client `heat-prod` is registered against the login domain; the authorizer `cognito` with the browser client as its only audience; the stage throttled at 10 requests a second with a burst of 20; the zone with A and AAAA aliases at the apex, the validation CNAME and the `auth` A alias beside NS and SOA; the certificate `ISSUED`, in use and eligible for renewal; the bucket `heat-prod-client` with all four public-access blocks; the distribution for `heat.dcg-games.com` deployed on `PriceClass_100`; the function `heat-prod-hub` on `nodejs24.x`, arm64, 1024 MB, 10 s, tracing active; 22 resources tagged `Stack=heat-prod` through the tagging API. From the laptop: `/` answers 200 with `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and `max-age=60`, `/config.json` carries its four fields, an anonymous `POST /graphql` is 401, a deep link is 200, `http://` is a 301 to `https://`, `/login` on the login host is 400 without a client, and the four name servers answer for `heat.dcg-games.com` at 1.1.1.1 and 8.8.8.8. Not read: the parameters under `/heat/heat-prod/`, which `AuditRole` may not read (`ssm:GetParametersByPath` denied). Re-plan through `plan-heat-prod` with the placeholders of "Planning on a laptop", from the documentation pull request's worktree with the bundle built: `Plan: 1 to add, 1 to change, 1 to destroy`, and every line of it is a placeholder, as for dev: `module.base.aws_cognito_identity_provider.google` updated in place for `client_id` and `client_secret`, and `module.environment.aws_sns_topic_subscription.alarm_email[0]` replaced for its `endpoint`. No code change, so the laptop's bundle hashes as the pipeline's did.

## What differs from dev

| | `dev` | `prod` |
| --- | --- | --- |
| Zone and hostname | `heat-dev.dcg-games.com` | `heat.dcg-games.com` |
| Login host | `auth.heat-dev.dcg-games.com` | `auth.heat.dcg-games.com` |
| `ci` password-flow client | yes, for the smoke test and the test users | none: `ci_client = false`, so no password is accepted anywhere in prod |
| Test users | `player1`, `player2`, created by the apply job | none, and no `test-users.txt` |
| Authorizer audiences | the `ci` client and the browser client | the browser client alone |
| Parameters | the six | five: no `app_client_id` |
| Smoke test | the whole loop, signed in as `e2e@heat-dev.dcg-games.com` | the token-free half of `scripts/e2e.mjs` (`--anonymous`): the page, `config.json` with the deploy's version, the managed login page, the hand-off to Google, 401 at `/graphql`; nothing signs in, nothing is written, no cold start is read |
| Applied by | `deploy.yml`, on every merge to `main` | `release.yml`, on every merge to `release`, behind the guard, then the tag and the Release |
| Who merges the apply | the owner, any pull request to `main` | the owner, the release pull request from `main` (or a hotfix branch) to `release` |

Everything else is the same literal: thirty-day log retention, point-in-time recovery and deletion protection on both tables, a throttle of 10 requests a second with a burst of 20 (heat-prod's Lambda concurrency quota is the new-account 10, read 2026-10-18, and prod is its only stack; the quota is raised when players arrive, and the throttle with it), no extra callback URL, `PriceClass_100`, the alarms to the owner's address, and no provisioned concurrency (the overview's cold-start item; the bootstrap boundary denies it in any case).

## Layout

| Path | Holds |
| --- | --- |
| `terraform/modules/base/` | The zone, the certificate, the pool with Google; the `ci` client only where asked for |
| `terraform/modules/environment/` | The tables, the function with its role and alias, the API, the browser client, the site (`terraform/modules/site`), the parameters, the alarms |
| `terraform/modules/login-domain/` | The pool's custom domain for managed login and its alias record |
| `terraform/environment/prod/` | This root: the backend block with the key `environment/prod/terraform.tfstate`, one provider for the prod account, the three module calls with prod's literals, the outputs, the lock file |
| `.github/workflows/release.yml` | Plans the root on every pull request to `release` under the `prod` environment and applies it on every merge, then publishes the client, runs the smoke test and writes the tag and the Release |
| `.github/rulesets/release.json` | What may change `release`: a pull request, merged with a merge commit, with "Build and test" and "Release source" passing |
| `scripts/check-release-source.sh` | The guard: the head is `main` or `hotfix/<issue>-*`, and `release` has not drifted from it |
| `scripts/tag-release.sh` | The tag `v<YYYY>.<MM>.<DD>[.<n>]` on the merge commit and the GitHub Release from the pull request |

No flag selects an environment; the directory does (decision 0016).

## Variables

| Variable | From, in the pipeline | From, on a laptop |
| --- | --- | --- |
| `workload_account_id` | The repository variable `HEAT_PROD_ACCOUNT_ID` | The private script in `docs/private/`, or `terraform.tfvars` |
| `google_client_id` | The `prod` environment's variable `HEAT_GOOGLE_CLIENT_ID`, the client registered against `auth.heat.dcg-games.com` | A placeholder |
| `google_client_secret` | The `prod` environment's secret `HEAT_GOOGLE_CLIENT_SECRET` (sensitive) | A placeholder |
| `alarm_email` | The `prod` environment's variable `HEAT_ALARM_EMAIL` | A placeholder |

One name per value in every environment; the environment supplies the value (decision 0020). No `HEAT_TEST_USER_PASSWORD` on `prod`: there are no test users. Prod's values never cross a laptop, so a local plan uses placeholders and is a plan of the shape; the plan with real values is the release pull request's, posted by the `Release` workflow, or the apply job's, in its run summary.

## Outputs

`zone_id`, `zone_name`, `zone_name_servers`, `user_pool_id`, `user_pool_name`, `certificate_arn`, `login_host`, `browser_client_id`, `site_url`, `api_url`, `client_bucket`, `distribution_id`, `function_names`, `parameter_prefix`, `alarm_topic_arn`, `password_sign_in`, `app_version`. No `ci_client_id`. None is secret and none carries the account id. The apply job reads `client_bucket`, `user_pool_id`, `browser_client_id`, `login_host`, `password_sign_in` and `app_version` for `config.json`.

## Who applies it

The pipeline, and nothing else, in `.github/workflows/release.yml`:

- **On a pull request to `release`**, under the `prod` GitHub environment with the plan role `heat-prod-plan`, after the guard: the bundle, `init`, `plan -lock=false`, the allow-list check, and the plan in the job summary and in one comment on the pull request. The guard, "Release source", is a required check of the `release` ruleset: the head is `main` or a `hotfix/<issue>-*` branch, and `release` carries nothing beyond its merge base with the head, so a hotfix on `release` must have been merged into `main` before `main` is released again.
- **On a push to `release`**, which the ruleset allows only as the merge of such a pull request, under the same environment with the apply role `heat-prod-apply`: the guard again, asking GitHub which pull request the merge commit came from; the bundle and the client's production build; `init`, `plan`, the allow-list check, the plan in the job summary, `apply` of exactly that plan; the client build and `config.json` published into the bucket (`scripts/publish-client.sh`); the site's URL in the job summary and on the deployment; the smoke test; then the tag and the GitHub Release (`scripts/tag-release.sh`), with the pull request's title and body as the notes. The tag triggers nothing.

**A release** is therefore: the agent opens a pull request from `main` to `release` (an agent opens pull requests, rule 8), the `Release` workflow posts the guard's verdict and the `prod` plan on it, the owner reads the diff and the plan and merges, and the run applies, tests, tags. A release pull request closes no issue. A pull request to `release` from any other branch than `main` or `hotfix/<issue>-*` is refused by the guard. How a hotfix reaches `main` afterwards is settled with the first hotfix (decision 0021); until it is merged into `main`, the guard refuses the next release of `main`.

**The owner's steps, once, before Issue-41's pull request merges.** The `release` branch from the `main` that preceded Issue-41's merge (done 2026-10-18, at the merge of PR-63), so that the first release pull request has a diff. The `prod` GitHub environment with the branch policies `main` and `release`, because a pull request's plan runs on `main`'s ref and the apply on `release`'s (decisions 0020 and 0021), with the variables `HEAT_GOOGLE_CLIENT_ID` and `HEAT_ALARM_EMAIL` and the secret `HEAT_GOOGLE_CLIENT_SECRET`. In the Google Auth Platform, in the `HEAT` project: a Web application client `heat-prod` with the authorized JavaScript origin `https://auth.heat.dcg-games.com` and the authorized redirect URI `https://auth.heat.dcg-games.com/oauth2/idpresponse`; Google shows the secret once. The `release` ruleset applied from its file and the `release-tags` ruleset deleted. From the checkout or a worktree, in PowerShell:

```powershell
gh api --method PUT repos/Heroic-Enterprise-Adventure-Time/HEAT/environments/prod -F "deployment_branch_policy[protected_branches]=false" -F "deployment_branch_policy[custom_branch_policies]=true"
gh api --method POST repos/Heroic-Enterprise-Adventure-Time/HEAT/environments/prod/deployment-branch-policies -f name=main -f type=branch
gh api --method POST repos/Heroic-Enterprise-Adventure-Time/HEAT/environments/prod/deployment-branch-policies -f name=release -f type=branch
gh variable set HEAT_GOOGLE_CLIENT_ID --env prod --body "<the client id>"
gh secret set HEAT_GOOGLE_CLIENT_SECRET --env prod
gh variable set HEAT_ALARM_EMAIL --env prod --body "<the address>"
gh api --method POST repos/Heroic-Enterprise-Adventure-Time/HEAT/rulesets --input .github/rulesets/release.json
gh api --method DELETE repos/Heroic-Enterprise-Adventure-Time/HEAT/rulesets/<id of release-tags>
```

`gh secret set` prompts for the value; it is typed, never pasted into a chat or a file. The pull request's description carries these as task items.

## The first release and the delegation

As with dev, the certificate is validated by DNS through the zone, and the zone's four name servers are only known once it exists, so the first apply and the delegation interleave: the apply creates the zone within its first seconds, then waits at the certificate's validation (`aws_acm_certificate_validation`, the provider's default of 75 minutes); the agent reads the name servers through `audit-heat-prod` and a `dcg-platform` session writes the `heat.dcg-games.com` NS record into the parent zone, which the owner applies; when the delegation lands inside the window the same run completes, and when it does not the run fails at the waiter and the owner re-runs the failed job, which finishes from the state the first run left. ACM gives up on a validation after 72 hours.

After the first release, the owner confirms the alarms' email subscription from the mail SNS sends, and signs in with Google at `https://heat.dcg-games.com`, which is the one authenticated check prod gets and proves the Google client is registered against the right domain. The status above is then updated. All three happened on 2026-10-18 (Issue-64). The two things the first release was to find out, recorded in decision 0021 as not yet checked, were found as the documentation implied: the workflow's token created the tag with no tag ruleset in force, and the `prod` environment's policy admitted the `pull_request_target` run on `main`'s ref. What it found that was not foreseen: the guard must run `main`'s copy of its script, because on the first release `release` predated the script (PR-68); and the "Sandbox stacks" URL comment job fails on a release pull request, whose head carries no issue number (Issue-66). The procedure as it has run is `docs/process/deployment.md`.

The Google project's publishing status is the owner's call, outside this root: in Testing, Google limits who may sign in, which is enough for the owner's own check and not for players.

## Planning on a laptop

The agent plans this root before pushing an infrastructure change (decision 0017, guardrail 5), through its `plan-heat-prod` profile, from the worktree, with the bundle built and placeholders for the three values that never cross a laptop. In PowerShell:

```powershell
. C:\Users\chanc\IdeaProjects\HEAT\docs\private\heat-tfvars.ps1 -Environment prod
$env:AWS_PROFILE = "plan-heat-prod"
$env:TF_VAR_google_client_id = "000000000000-example.apps.googleusercontent.com"
$env:TF_VAR_google_client_secret = "GOCSPX-example"
$env:TF_VAR_alarm_email = "alarms@example.com"
$env:TF_VAR_app_version = git rev-parse HEAD
npm ci
npm run bundle
terraform -chdir=terraform/environment/prod init
terraform -chdir=terraform/environment/prod plan -lock=false
```

`-lock=false` because the plan role may not write the lock file. The plan shows the placeholder client id and the address in clear and the secret as sensitive; the pipeline's plan has the real ones.

## Verification

Every release verifies prod through the smoke test in the run summary. After a change to this root or a module, the agent also reads the account through `audit-heat-prod` and `plan-heat-prod` for what the test cannot see: the tables' recovery and deletion protection, the retention, the alarms and their topic, the role's statements, the stage's throttle, the bucket's public access block and policy, the distribution's behaviors, the pool, its domain and its clients (the browser client alone, no `ci`), and that nothing else was created.

## Lock file

`.terraform.lock.hcl` is committed, for Windows and Linux, and is the dev root's: the same two providers at the same versions.

```powershell
terraform providers lock -platform=windows_amd64 -platform=linux_amd64
```
