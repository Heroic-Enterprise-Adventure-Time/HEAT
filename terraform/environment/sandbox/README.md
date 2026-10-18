# The sandbox stacks

One root for every per-issue sandbox stack in `heat-sandbox`: `heat-sb<issue>`, the environment module (`terraform/modules/environment`) with the sandbox's literals, on top of the base every stack shares (`terraform/environment/sandbox-base`). What tells one stack from another is the issue number from the branch name, which names the stack and its state key, `environment/sandbox/<issue>/terraform.tfstate` (decision 0018, amending 0016 for this root only). History: Issue-38.

**Status: not yet applied.** The first stack, `heat-sb38`, is created by the push of Issue-38's own branch; this line changes in a commit once it has.

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

- **On a push to a working branch** (`feat/**`, `fix/**`, `docs/**`, `infra/**`, `chore/**`, `hotfix/**`): the checks (typecheck, tests, schema currency), the bundle as an artifact; then, under the GitHub environment `sandbox-<issue>`, the apply role: the cap, `init` with the key, `plan`, the allow-list check, the plan in the job summary, `apply` of exactly that plan, and the stack's API URL in the summary and on the deployment.
- **On the deletion of such a branch**: `main`'s copy of this root, the bundle (the root evaluates its hash even to destroy), and `destroy` from the key, under `sandbox-<issue>`.
- **Weekly, and by hand with a dry run**: every stack whose branch is gone is destroyed, under `sandbox-sweep`.

The account id reaches Terraform as `TF_VAR_workload_account_id` from the repository variable `HEAT_SANDBOX_ACCOUNT_ID`, and is replaced by `<account id>` in every plan the workflow writes.

**The cap.** `SANDBOX_STACK_CAP` in the workflow is 5. Before planning, the job counts the state keys under `environment/sandbox/` other than `base/` and this issue's own, and fails naming the stacks when the count is at the cap. A re-apply of an existing stack is never refused by it.

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

After a stack's first apply, the agent reads the account through `audit-heat-sandbox` and the stack's logs through `plan-heat-sandbox`: the two tables, the function with its alias and role, the API with its authorizer, routes and stage, the three parameters, and nothing else created. Then a token from the `ci` client (the owner holds the test password) calls `startAdventure` and `settleAdventure` through the API, and the function's log shows one JSON line per request. Then the cold start: the `Init Duration` of the first invocation after the deploy, recorded in `docs/architecture/overview.md`.

## Lock file

`.terraform.lock.hcl` is committed, for Windows and Linux:

```powershell
terraform providers lock -platform=windows_amd64 -platform=linux_amd64
```
