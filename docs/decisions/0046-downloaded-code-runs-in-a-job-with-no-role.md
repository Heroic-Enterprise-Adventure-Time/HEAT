# 0046: Downloaded code runs in a job that holds no role, and a test user's password crosses to it sealed

- **Status:** Decided
- **Date:** 2026-11-06
- **Settles:** Issue-231, from the review of PR-230: `docs/process/best-practices.md`, rule 13, said a step that runs downloaded code holds no apply role's credentials, and asked for install and test steps to run before the role is assumed or with the keys removed.
- **Amends:** 0020, "There are no repository secrets" and "the per-issue environments hold none": one repository secret, `HEAT_E2E_HANDOVER_KEY`, now reaches the per-issue stacks' jobs. 0045, "No role's credentials in the browser": the browser's job holds no role at all, so the keys are no longer blanked step by step in the workflow.

## Decision

**The job is the boundary, not the step.** A step cannot give up what its job holds. npm, what it installs and the browser run in jobs with no `id-token` permission, no environment and no secrets; the jobs that assume a role run only Terraform, this repository's scripts and the AWS CLI, and download what the other jobs built. `.github/actions/stack-test` refuses to run if it finds AWS keys or the token request variable, so a later change cannot quietly bring a role back.

| Workflow | Jobs with no role | Jobs under a role |
| --- | --- | --- |
| `sandbox.yml` | `checks`, `stack-test`, `name-deleted`, `sweep-bundle` | `apply`, `cold-start`, `destroy`, `sweep` |
| `deploy.yml` | `build`, `stack-test` | `plan`, `apply`, `cold-start` |
| `release.yml` | `build` | `plan`, `apply` |

**The environment's secrets move with the role.** The plan and apply jobs keep `TF_VAR_google_client_secret` in their environment, and `npm ci` no longer runs in them.

**What stays under a role.** Terraform and its providers, whose hashes the lock files pin, and the GitHub actions those jobs are built from, which have to run there. `prod`'s anonymous smoke test stays in its apply job, because it imports nothing downloaded and has no password to hand over.

**A role's job treats an artifact as data.** It downloads only from its own run, into `dist/` or `client/`, which the checkout does not track, so nothing it unpacks can replace a script. Terraform zips and hashes the bundles and `scripts/publish-client.sh` copies the client to its bucket; nothing under a role executes either. This keeps a compromised package from the role, not from what ships: the bundle and the client are built from those packages, as they always were, so its code can still reach a Lambda function or the page, and that function runs under its own execution role.

**The handover.** The apply job mints the test user's random password as before. `scripts/stack-handover.sh` encrypts it with `openssl enc` under the repository secret `HEAT_E2E_HANDOVER_KEY`, and writes it with the site URL, the `ci` client's id and the username to the run's `stack-handover` artifact, kept for a day. The test's job opens it and masks the password. The artifact is public and only the password in it is sealed: the other three values are already in the public log. A leaked key exposes only test users' passwords, each replaced by that user's next run; the key enters no AWS account and reaches no production secret.

**A run holds its branch whole.** Workflow-level concurrency on `sandbox.yml`'s and `deploy.yml`'s push runs, because the next apply resets the password and moves the version, and could otherwise land between this run's apply and its test. A queued run waits longer as a result.

**The cold start is a job of its own, under the role, after the tests,** because reading the function's log takes a role and the test user's calls are what it measures. It records a second deployment on the environment, so it carries the site's URL.

## Considered and not chosen

**Steps with the keys removed, as the issue asked.** A smaller change with no new secret. It leaves the role reachable from `npm ci` and Playwright on the sandbox stacks and `dev`: see "Facts checked". The builds would have moved in any case, so `prod` would have been covered either way.

**Running install and tests before the role is assumed, in one job.** Code from an install step can keep running on the runner and wait for the credentials, and the job's `id-token` permission applies from the first step to the last.

**A narrow role for the test's job,** trusting a subject with no environment and allowed only to set the test user's password. It needs no key, and it puts a token request back in the job that runs downloaded code; Cognito's `AdminSetUserPassword` cannot be scoped to one user, so that role could reset any user in the pool.

**A password derived from a secret,** an HMAC of the username. Simpler, with nothing to carry, but a leaked secret gives every later password too, while a leaked key opens only what was sealed with it.

**A stored test password in each environment.** Per-issue environments are created on first reference and hold none, and it would be a long-lived password in reach of downloaded code.

**Job outputs for the handover.** `deploy.yml`'s apply job is a matrix, whose outputs are whichever row wrote last, so one row's empty value could overwrite `dev`'s.

**Downloading the artifacts to `runner.temp`,** which is what CodeQL's `actions/artifact-poisoning/critical` asks for and what would clear its two alerts on `release.yml`. Terraform reads the bundles from `dist/` through each root's `dist_dir`, so it means changing all three roots, or moving the files back to `dist/` after the download, which would satisfy the scanner and protect nothing. The query matches any `terraform` command after such a download and does not compare paths, and here the artifact cannot reach the `.tf` files: see "Facts checked". Recommended: dismiss the alerts as false positives, which is the owner's call on PR-240.

## Facts checked

- CodeQL's query, read 2026-11-07 from `github/codeql`, `ArtifactPoisoningQuery.qll` and `poisonable_steps.yml`: it treats a download as untrusted when any job in the workflow checks out a pull request's head under `pull_request_target` and uploads an artifact, without looking at which event the downloading job runs on, and its sink is any later command in its list, `terraform` among them, unless the download went to `runner.temp`. Its source says it skips the path check for such commands. An explicit `if: github.event_name == 'push'` on `release.yml`'s apply job did not clear the alerts, run on commit 98a293d.
- `actions/download-artifact` at `v8`, read 2026-11-07 from its bundled `dist/index.js`: `unzip-stream` rewrites every `..` segment of an entry's path to `.` before `Extract` joins it to the target directory, and `Extract` writes each entry with `fs.createWriteStream`, so an entry stays under `dist/` or `client/`. Read from the source, not tried with a crafted archive; `v8` is a tag and can move.

- **A step cannot give up the role, observed 2026-11-06,** run 42316078466 on `heat-sb231`, by a temporary step in the apply job with the three AWS keys blanked: `ACTIONS_ID_TOKEN_REQUEST_TOKEN` was present, the step minted a token with `curl`, and `sts assume-role-with-web-identity` assumed `heat-sandbox-apply` with it. The step printed yes or no and no value, and was removed before review.
- GitHub, "OpenID Connect reference", read 2026-11-06: `id-token: write` is set on a job or a workflow, and a token is requested with `ACTIONS_ID_TOKEN_REQUEST_URL` and `ACTIONS_ID_TOKEN_REQUEST_TOKEN`. A job's subject names its environment, so a job with none cannot present the subject the apply roles trust.
- The tj-actions/changed-files compromise, CVE-2025-30066, as described by Sysdig and Upwind, read 2026-11-06: the injected script read secrets from the memory of the runner's `Runner.Worker` process, so what a job holds is not limited to what is in a step's environment.
- GitHub, "Workflow syntax", read 2026-11-06: a new pending job or run in a concurrency group cancels the one already pending. A merge replaced in `deploy.yml`'s queue is contained in the merge that replaced it.
- `scripts/stack-handover.sh`, run on a laptop 2026-11-06 with fake values: the round trip returned the password, and a wrong key was refused.
- The whole push path, observed 2026-11-07, run 42316705580 attempt 2 on `heat-sb231`: the plan showed no changes, the job with no role passed the stack test and all three browser tests, and the cold start ran after them under the role. The artifact holds the password only in its sealed form, and the run's log matched none of the patterns searched for secrets. The same run without the repository secret was refused at the seal step, naming the secret.
- The sweep, observed 2026-11-07, run 42410029940 from the branch with the dry run on: `sweep-bundle` built with no role and `sweep` listed under the role and found no orphan, so its dry-run, download and destroy steps did not run.

## Where it is described

`docs/process/best-practices.md`, rule 13; `docs/process/development.md`, rule 1; `docs/architecture/overview.md`, "Environments"; `terraform/environment/sandbox/README.md`; `terraform/environment/dev/README.md`; `.github/workflows/`; `.github/actions/stack-test`; `scripts/stack-handover.sh`.
