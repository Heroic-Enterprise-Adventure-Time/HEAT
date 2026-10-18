# The sandbox stacks

One root for every per-issue sandbox stack in `heat-sandbox`: `heat-sb<issue>`, the environment module (`terraform/modules/environment`) with the sandbox's literals, on top of the base every stack shares (`terraform/environment/sandbox-base`). What tells one stack from another is the issue number from the branch name, which names the stack and its state key, `environment/sandbox/<issue>/terraform.tfstate` (decision 0018, amending 0016 for this root only). History: Issue-38.

**Status: the first stack, `heat-sb38`, applied by the pipeline on 2026-10-17 by the `Sandbox stacks` run on the push of Issue-38's branch, under the GitHub environment `sandbox-38`: 18 added, nothing changed or destroyed, the cap at 0 of 5, the allow-list check passed.** Read back the same evening: the two tables with `PK` and `SK`, on-demand, no recovery and no deletion protection (`audit-heat-sandbox`); the function on `nodejs24.x`, arm64, 1024 MB, 10 s, tracing active, the four environment variables, version 1 behind the alias `live`; the role under `heat-sandbox-boundary` with its three statements; the API with the `cognito` JWT authorizer on the base pool and the `ci` client as audience, two `JWT` routes, the `$default` stage at 10 a second with a burst of 20 and its access log; both log groups at 7 days; the three parameters (`plan-heat-sandbox`). `POST /graphql` without a token and with a bad one both answer 401 from the authorizer. A re-plan from the laptop through the plan role after the apply: no changes, so the laptop's bundle hashes the same as the runner's. The owner then signed in as `player1` with the `ci` client and ran `startAdventure` and `settleAdventure` through the API (2026-10-17): three invocations in the log, the first a cold start of 627 ms initialization plus 234 ms, the warm ones 50 and 58 ms, each with its JSON request line and X-Ray trace, and the access log showing the earlier unauthenticated call refused with `token not provided`. `settleAdventure` answered null, as expected for a player with no profile item; the balances and ledger were written.

## Layout

| Path | Holds |
| --- | --- |
| `terraform/modules/environment/` | The resources |
| `terraform/environment/sandbox/` | This root: the backend block without a key, one provider for the sandbox account, the data sources that find the base's pool and `ci` client by name, one module call with the sandbox's literals, the outputs, the lock file |
| `scripts/sandbox.mjs` | Derives the issue number from the branch and runs `init` with the key and `plan`, `apply`, `destroy`, `output` with the issue; counts stacks for the cap; lists orphans |
| `.github/workflows/sandbox.yml` | Applies on push, destroys on branch deletion, sweeps weekly |

No flag is typed by a person: the script supplies the key and the issue, so the pair cannot mismatch.

## What a stack manages

In `heat-sandbox`, us-east-1, every resource tagged `Project=heat`, `Environment=sandbox`, `Stack=heat-sb<issue>`, `ManagedBy=terraform`: what the module README lists, with seven-day log retention, no point-in-time recovery, no deletion protection, a throttle of 10 requests a second with a burst of 20. The authorizer accepts the base's `ci` client, so the test users sign in with the password flow and call the stack. No browser client until Issue-46, no hostname until Issue-39.

What it reads from the base, by name: the pool `heat-sb-base-users` and its `ci` client, through `aws_cognito_user_pools` and `aws_cognito_user_pool_clients`. Never the base's state.

## Who applies it

The pipeline, and nothing else, in `.github/workflows/sandbox.yml`:

- **On a push to a working branch** (`feat/**`, `fix/**`, `docs/**`, `infra/**`, `chore/**`, `hotfix/**`): the checks (typecheck, tests, schema currency), the bundle as an artifact; then, under the GitHub environment `sandbox-<issue>`, the apply role: the cap, `init` with the key, `plan`, the allow-list check, the plan in the job summary, `apply` of exactly that plan, the stack's API URL in the summary and on the deployment; then the stack test: the stack's user `e2e-<issue>@heat-sb.dcg-games.com` minted in the base pool with a random password for that run (`scripts/e2e-user.sh`), `scripts/e2e.mjs` signing in through the `ci` client and running start, a refused second start, settle with the engine's rewards and a refused second settle, and the cold start read from the function's log into the summary (`scripts/report-cold-start.sh`).
- **On the deletion of such a branch**: `main`'s copy of this root, the bundle (the root evaluates its hash even to destroy), `destroy` from the key, `forget` of the empty state, and the deletion of the stack's test user, under `sandbox-<issue>`.
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

Every push verifies its own stack: the run summary shows the plan, the stack test's output and the cold start. After a change to this root or the module, the agent also reads the account through `audit-heat-sandbox` and `plan-heat-sandbox` for what the test cannot see: the tables' settings, the role's statements, the stage's throttle, retention, and that nothing else was created.

## Lock file

`.terraform.lock.hcl` is committed, for Windows and Linux:

```powershell
terraform providers lock -platform=windows_amd64 -platform=linux_amd64
```
