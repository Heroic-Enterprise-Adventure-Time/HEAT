# The sandbox base

What every per-issue sandbox stack in `heat-sandbox` shares, in one permanent root: the hosted zone `heat-sb.dcg-games.com` and the account's one Cognito user pool with its `ci` app client, composed from the module `terraform/modules/base`, which the `dev` and `prod` roots compose too. The first stack the pipeline applies, and the root that proves the plan-on-pull-request, apply-on-merge path (decisions 0017, 0018, 0020). The pool's shape is decision 0022. History: Issue-37.

**Status: not applied. The pipeline applies it on the merge of Issue-37's pull request, under the `sandbox-base` GitHub environment, and this line is replaced by the result.** Before that merge the agent planned it through the `plan-heat-sandbox` profile against the real backend: three to add, the zone, the pool and the client, and the allow-list check passed on that plan.

## Layout

| Path | Holds |
| --- | --- |
| `terraform/modules/base/` | The resources, parameterised by name prefix and zone name: the zone, the pool, the `ci` client, the outputs |
| `terraform/environment/sandbox-base/` | This root: the backend block with the key `environment/sandbox/base/terraform.tfstate`, one provider for the sandbox account, one module call with the sandbox's literals, the outputs, the lock file, and `test-users.txt` |
| `terraform/environment/sandbox-base/terraform.tfvars` | Ignored by git: the sandbox account id, copied from `terraform.tfvars.example`, for a plan on a laptop without the private script |

No flag selects anything; the directory does (decision 0016).

## What it manages

In `heat-sandbox`, us-east-1, every resource tagged `Project=heat`, `Environment=sandbox`, `Stack=base`, `ManagedBy=terraform`:

- **The hosted zone `heat-sb.dcg-games.com`**, with `prevent_destroy`. Delegated from `dcg-games.com` by the organization layer in the `dcg-platform` repository: after the first apply, the HEAT session tells the dcg-platform session that the zone exists in `heat-sandbox`, that session reads the four name servers itself and writes them into the parent zone, and the delegation is live once the owner applies there. Nothing in this root waits on the delegation; the wildcard certificate, which does, is created by Issue-39.
- **The user pool `heat-sb-base-users`.** Essentials tier; email as the username, required and case-insensitive; self sign-up off; MFA off; Cognito's default password policy; administrator-only recovery; deletion protection and `prevent_destroy`; no domain, no managed login and no identity provider until Issue-46 adds the first browser client and Google (decision 0022).
- **The app client `ci`.** Public; `USER_PASSWORD_AUTH` and `REFRESH_TOKEN_AUTH`; access and ID tokens of one hour, refresh tokens of one day; user-existence errors suppressed; token revocation on. What the end-to-end tests sign in with.

What it does not manage: the test users. They are data (decision 0020). The apply job creates them after `terraform apply` from `test-users.txt` beside this README, with `scripts/create-test-users.sh`: `admin-create-user` with the address verified and no invitation, then `admin-set-user-password --permanent`, both idempotent, with the password from the `sandbox-base` environment's secret `HEAT_TEST_USER_PASSWORD`. Adding a user is adding a line; changing the secret changes every user's password on the next apply. The two users today are `player1@heat-sb.dcg-games.com` and `player2@heat-sb.dcg-games.com`.

## Outputs

`zone_id`, `zone_name_servers`, `user_pool_id`, `user_pool_arn`, `user_pool_endpoint`, `ci_client_id`. None is secret and none carries the account id. The apply job reads `user_pool_id` for the test-user step; the per-issue stacks will read the pool and the zone through their own data sources or outputs when Issue-38 writes them.

## Who applies it

The pipeline, and nothing else (`docs/process/code-changes.md`, rule 18), in `.github/workflows/deploy.yml`:

- **On a pull request to `main`**, a job under the `sandbox-base` GitHub environment checks out the pull request's head, assumes `heat-sandbox-plan`, runs `terraform plan -lock=false`, runs the allow-list check (`scripts/check-plan-resource-types.mjs` against `terraform/allowed-resource-types.txt`), and writes the plan to the job summary and to one comment on the pull request, edited in place on every push (`scripts/post-terraform-plan.sh`). The event is `pull_request_target`, so the run carries `main`'s ref and the environment's `main`-only branch policy admits it (decision 0020). Two consequences: a change to the workflow itself takes effect for pull requests only once it is on `main`, and Dependabot's pull requests get no plan.
- **On a push to `main`**, a job under the same environment assumes `heat-sandbox-apply`, plans, runs the same check, writes the plan to the job summary, applies exactly that plan, and creates the test users. One apply at a time per root, never cancelled.

The account id reaches Terraform as `TF_VAR_workload_account_id` from the repository variable `HEAT_SANDBOX_ACCOUNT_ID`, and is replaced by `<account id>` in every plan the workflow posts. The role ARNs are not stored: each is the account id plus the committed name (`terraform/bootstrap/README.md`).

**The owner's steps, once, before the first merge:** the environment with its secret and its branch policy. From the checkout or a worktree, so that `gh` finds the repository:

```powershell
gh api --method PUT repos/Heroic-Enterprise-Adventure-Time/HEAT/environments/sandbox-base -F "deployment_branch_policy[protected_branches]=false" -F "deployment_branch_policy[custom_branch_policies]=true"
gh api --method POST repos/Heroic-Enterprise-Adventure-Time/HEAT/environments/sandbox-base/deployment-branch-policies -f name=main -f type=branch
gh secret set HEAT_TEST_USER_PASSWORD --env sandbox-base
```

`gh secret set` prompts for the value; it is typed, never pasted into a chat or a file. The password must meet Cognito's default policy: at least eight characters with an upper-case letter, a lower-case letter, a number and a symbol.

## Planning on a laptop

The agent plans this root before pushing a change to it (decision 0017, guardrail 5), through its `plan-heat-sandbox` profile, which may read this account's state prefix and nothing it should not. The root takes no secret, so nothing more is needed than the account id. From the worktree, in PowerShell:

```powershell
. C:\Users\chanc\IdeaProjects\HEAT\docs\private\heat-tfvars.ps1 -Environment sandbox
$env:AWS_PROFILE = "plan-heat-sandbox"
cd <the worktree>\terraform\environment\sandbox-base
terraform init
terraform plan -lock=false
```

`-lock=false` because the plan role may not write the lock file, and a read-only plan needs no lock. The private script sets more variables than this root declares; Terraform warns about none of them, because `TF_VAR_*` values for undeclared variables are ignored.

## Verification

After the first apply, the agent reads the account through `audit-heat-sandbox`: the zone with its four name servers and no record but NS and SOA; the pool with the settings above; the `ci` client with its flows and validities; the two users, `CONFIRMED` with `email_verified` true; and nothing else created. Then a password-flow sign-in with the `ci` client as `player1` returns tokens, which proves the pool, the client and the test-user step together. Then `terraform plan -lock=false` through the plan role shows no changes. Then the dcg-platform session is told the zone exists. The status line at the top of this file changes in a commit after each of these.

The test password is the owner's. For the sign-in check the owner runs it, or hands the agent a session in which the secret is an environment variable; the value itself is never pasted into a chat.

## Facts checked

All read on 2026-10-17; the pool's facts are in decision 0022.

- **`pull_request_target`** (GitHub, "Events that trigger workflows"): the run is "in the context of the default branch of the base repository", `GITHUB_REF` is the default branch and `GITHUB_SHA` its last commit; "Running untrusted code on the `pull_request_target` trigger may lead to security vulnerabilities", the risk decision 0020 records as accepted while every author is trusted. Heads from other repositories are refused by the job's condition.
- **Contexts in a job's keys** (GitHub, "Contexts reference"): `jobs.<job_id>.environment` and `jobs.<job_id>.concurrency` may use `matrix` and `vars`; `jobs.<job_id>.strategy` may use `vars`, which is how the account id variable reaches the matrix. Indexing the `secrets` context by an expression is not documented, so the test-user step names its secret.
- **Comment length** (GitHub REST, "Issue comments"): a comment body holds up to 65,536 characters; the workflow cuts a longer plan and points at the job summary, which holds the whole of it.
- **`terraform providers lock`** regenerates the lock file for Windows and Linux so that the owner's machine, the agent's and the runner resolve the same provider:

```powershell
terraform providers lock -platform=windows_amd64 -platform=linux_amd64
```
