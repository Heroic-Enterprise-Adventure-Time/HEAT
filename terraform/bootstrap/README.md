# The bootstrap stack

Creates, in a workload account, what the pipeline needs before it can run there: the GitHub OIDC identity provider; a read-only plan role; an administrator apply role under a permissions boundary; and a monthly cost budget with alerts and an action that freezes the apply role when the budget is passed. One root directory per account, `sandbox/`, `dev/` and `prod/`, each composing the module `terraform/modules/bootstrap` with that account's values as literals and keeping its own state key (decision 0016). Design: `docs/architecture/overview.md`, "Environments"; decisions 0017, 0018 and 0019. History: Issue-12 (the provider and a narrow deploy role), Issue-19 (the budget), Issue-21 (the root-per-environment layout), Issue-36 (this shape; the deploy role removed).

**Status: `dev` applied through Issue-21 on 2026-10-16; the Issue-36 shape is written and not applied anywhere.** What is in `heat-dev` today, read through `audit-heat-dev` on 2026-10-16: the provider, the role `heat-dev-deploy` with its one inline policy, the budget `heat-dev-monthly-cost` at 10 USD with three notifications, and nothing else of HEAT's. `heat-prod` holds only `PlatformAdminRole`; `heat-sandbox` does not exist yet. What each root waits on is under "Applying".

## Layout

| Path | Holds |
| --- | --- |
| `terraform/modules/bootstrap/` | The resources, parameterised by environment: provider, plan role, apply role, boundary, budget with its action |
| `terraform/bootstrap/sandbox/`, `dev/`, `prod/` | One root per account: backend block with the key `bootstrap/<environment>/terraform.tfstate`, the two providers, one module call with that account's literals, the lock file. `dev/` also keeps four `moved` blocks from Issue-21 as history |
| `terraform/bootstrap/<environment>/terraform.tfvars` | Ignored by git: three account ids and the alert address, copied once from `terraform.tfvars.example` |

No flag selects an environment; the directory does.

## What it manages

In the workload account named by the root's `workload_account_id`:

- **The GitHub OIDC provider**: URL `https://token.actions.githubusercontent.com`, audience `sts.amazonaws.com`, no thumbprint (see "Facts checked").
- **The plan role `heat-<environment>-plan`.** AWS's `ReadOnlyAccess`, plus an inline policy that takes the data plane back: table items, objects in every bucket except this account's prefix in the state bucket, secret values, message receipt, log lines outside log groups whose names carry the environment's prefix, and in `dev` and `prod` user-pool records. Parameter values stay readable: they are non-secret by decision and a plan refreshes them. Trust: a GitHub Actions job of this repository with no environment, whose subject ends `:pull_request`, and the management account's SecurityAudit role, by the same ARN pattern the organization's `AuditRole` trusts. One-hour sessions. It is what the pull request's plan jobs run `terraform plan -lock=false` as, and what the agent assumes through a `plan-heat-<environment>` profile to plan a change before pushing it (decision 0017, guardrail 5). It cannot write anything, and it cannot read this stack's own state.
- **The apply role `heat-<environment>-apply`.** `AdministratorAccess` under the boundary below. Trust: a GitHub Actions job of this repository under the GitHub environment the root names, `dev` and `prod` exactly, `sandbox-*` in the sandbox account so that every per-issue stack's environment `sandbox-<issue>` matches. One-hour sessions.
- **The boundary `heat-<environment>-boundary`.** An allow-list of the service namespaces the shape uses: `lambda`, `apigateway`, `execute-api`, `dynamodb`, `s3`, `cognito-idp`, `cloudfront`, `acm`, `route53`, `logs`, `cloudwatch`, `ssm`, `xray`, `iam`, and `sts:GetCallerIdentity`. On top, explicit denies that hold whatever else is attached: `ec2`, load balancers, RDS, ElastiCache, OpenSearch, Redshift, MSK, Kinesis, SageMaker, ECS, EKS, EFS and Lambda provisioned concurrency; every IAM action on the plan role, the apply role, the budget's role, the boundary, the freeze policy and the provider; IAM writes on roles and policies outside the environment's name prefix (`heat-sb` in the sandbox account, `heat-dev`, `heat-prod`), `PassRole` included; creating or re-bounding a role with any boundary but this one, and removing a boundary from any role; creating users, keys and identity providers, and assuming roles; Budgets, Cost Explorer, the account and the organization. Every role an environment stack creates carries it; its ARN is `arn:aws:iam::<account>:policy/heat-<environment>-boundary`, which an environment root builds from the account id. What it cannot catch: DynamoDB provisioned capacity has no IAM condition key.
- **The budget `heat-<environment>-monthly-cost`** of the root's `monthly_budget_usd` (sandbox 20, dev 10, prod 10), with three email alerts to `budget_alert_email`: actual spend above 50%, actual spend above 80%, forecasted spend above 100%. **Its action**, automatic at 100% of actual spend, attaches the customer-managed policy `heat-<environment>-freeze`, which denies everything, to the apply role, and emails the same address. AWS Budgets runs it as `heat-<environment>-budget-action`, a role that trusts the Budgets service for this account's budgets only and may attach or detach that one policy on that one role. The boundary forbids the apply role from detaching it. Reversing the action, and resetting it so that it is evaluated again in the same month, is the owner's step in the console, on the budget's action history. The action stops new resources; it does not stop a function that keeps invoking. A kill switch for that is the environment stack's (Issue-38). The first two action-enabled budgets are free, each further one costs $0.10 a day, and the pricing page does not say whether that counts per account or per organization.

Nothing is created in `heat-platform`. The stack runs there and keeps its state there. What lets the roles at the state is the bucket's policy, in the `backend` stack.

## What it does not manage

Each line says what is in force in `heat-dev`, read through the `audit-heat-dev` profile on 2026-10-15 and again on 2026-10-16, and what that leaves open.

- **Account-level S3 public access block.** Not set, and not this stack's to set. It belongs to the organization layer as an AWS Organizations declarative policy for Amazon S3; owed on the `dcg-platform` side, not started. Until it exists, the environment stack puts a block on every bucket it creates.
- **EBS default encryption.** Off, and dropped: no declarative policy attribute for it, and the boundary denies `ec2` entirely.
- **IAM password policy.** None. The organization's controls deny creating IAM users, and so does the boundary.
- **GuardDuty.** A detector exists, created by the organization's delegated administrator.
- **IAM Access Analyzer.** None in the account; the organization-level analyzer is `dcg-platform`'s.
- **Log group retention.** The environment stack sets it on each group it creates.
- **A role in `heat-platform`.** None. The workload accounts' roles reach the state bucket through its policy (decision 0017, amending 0008), and the owner's `Admin` session is still the only identity `PlatformAdminRole` trusts.
- **The other half of the agent's plan path.** Cross-account assumption needs an allow on both sides. The SecurityAudit permission set's inline policy, in the `dcg-platform` repository, must list `arn:aws:iam::*:role/heat-*-plan` beside `AuditRole`; requested from that side on 2026-10-16. Until it does, the pipeline's plan path works and the agent's profile is refused.
- **A kill switch for running spend.** See the budget action above; Issue-38.
- **An artifact bucket.** None. Bundles are passed to the function as zips (decisions 0012 and 0017).

## Values that stay out of git

Four per root: the platform account id, the workload account id and the management account id (`docs/README.md`, rule 9), and the alert address. They live in the root's `terraform.tfvars`, which git ignores along with every `*.auto.tfvars`; Terraform loads it on every run. The same four can come from the environment as `TF_VAR_platform_account_id`, `TF_VAR_workload_account_id`, `TF_VAR_management_account_id` and `TF_VAR_budget_alert_email`. An ignored file belongs to one checkout: a worktree needs its own copy.

## Who applies it

The project owner, from PowerShell, with the `heat-platform` account's `Admin` credentials from the Identity Center access portal set as environment variables. The default provider refuses any other account. The stack reaches the workload account by assuming `PlatformAdminRole` there, which trusts that `Admin` role. This is the one stack the pipeline cannot apply for itself, because it creates the roles the pipeline assumes, so it stays the owner's (`docs/process/code-changes.md`, rules 18 and 25). The agent never applies anything.

## Applying

For an account, in this order: its bootstrap root; then the `backend` stack with the account listed in `workload_account_ids`, because the bucket policy names roles that must exist; then its account id as a repository variable; then the checks under "Verification". What each root waits on, as of 2026-10-16:

- `dev`: nothing. Apply from the Issue-36 branch.
- `prod`: nothing technical; the owner's decision to apply it in the same session.
- `sandbox`: the `heat-sandbox` account, created by the organization layer (`dcg-platform` pull requests 34 to 36, open on 2026-10-16). Once it exists, its id goes into the root's `terraform.tfvars` and the `audit-heat-sandbox` profile.

Once per root, create `terraform.tfvars` from its example. Then:

```powershell
Remove-Item Env:AWS_ACCESS_KEY_ID, Env:AWS_SECRET_ACCESS_KEY, Env:AWS_SESSION_TOKEN -ErrorAction SilentlyContinue
# paste the heat-platform Admin block from the access portal, then:
aws sts get-caller-identity --query Account --output text   # must print the heat-platform id
cd <the worktree>\terraform\bootstrap\dev
terraform init
terraform plan -out dev.tfplan
```

Read the plan. The pull request that changes the stack says what line to expect; for Issue-36, `dev` is `Plan: 10 to add, 0 to change, 2 to destroy.` (the two roles, their attachments and the plan role's inline policy, the boundary, the freeze policy, the budget's role with its inline policy, the budget action; the deploy role and its policy destroyed), and `sandbox` and `prod` are `Plan: 12 to add, 0 to change, 0 to destroy.` (the same ten plus the provider and the budget). Anything else: stop and paste the plan into the session. Then:

```powershell
terraform apply dev.tfplan
Remove-Item dev.tfplan
```

Two things learned on the first applies, 2026-10-15. PowerShell splits a `-flag=value` argument at a dot in the value, so a flag that takes a value is written with a space, as `-out dev.tfplan` is. And a value piped into `gh variable set` arrived with a UTF-8 byte-order mark in front of it; pass values as arguments, `--body "<value>"`, never through a pipe.

**On the GitHub side.** The workflows store no role ARNs: a role's ARN is the account id variable plus its committed name, `heat-<environment>-apply` or `-plan`. One repository variable per account: `HEAT_DEV_ACCOUNT_ID` exists, `HEAT_PROD_ACCOUNT_ID` and `HEAT_SANDBOX_ACCOUNT_ID` are set when their roots are applied (`gh variable set NAME --body "<id>"`), and `HEAT_DEV_DEPLOY_ROLE_ARN` is deleted with the deploy role (`gh variable delete HEAT_DEV_DEPLOY_ROLE_ARN`). The GitHub environment `dev` exists; `prod` is created by the first workflow that references it, or now with `gh api --method PUT repos/Heroic-Enterprise-Adventure-Time/HEAT/environments/prod`. The per-stack environments `sandbox-<issue>` are created by the sandbox workflow. The deployment policies of decision 0017, `dev` to the branch `main` and `prod` to tags `v*`, are the owner's, set once the pipeline exists (Issue-37):

```powershell
gh api --method PUT repos/Heroic-Enterprise-Adventure-Time/HEAT/environments/dev -F "deployment_branch_policy[protected_branches]=false" -F "deployment_branch_policy[custom_branch_policies]=true"
gh api --method POST repos/Heroic-Enterprise-Adventure-Time/HEAT/environments/dev/deployment-branch-policies -f name=main -f type=branch
gh api --method PUT repos/Heroic-Enterprise-Adventure-Time/HEAT/environments/prod -F "deployment_branch_policy[protected_branches]=false" -F "deployment_branch_policy[custom_branch_policies]=true"
gh api --method POST repos/Heroic-Enterprise-Adventure-Time/HEAT/environments/prod/deployment-branch-policies -f name=v* -f type=tag
```

**The agent's profiles.** One per account in `~/.aws/config`, chained from the same SecurityAudit key as the `audit-*` profiles, appended by the owner:

```ini
[profile plan-heat-dev]
role_arn = arn:aws:iam::<heat-dev account id>:role/heat-dev-plan
source_profile = 209804271597_SecurityAudit
region = us-east-1
```

With it, the agent plans an environment root from its worktree with `AWS_PROFILE=plan-heat-dev` and `terraform plan -lock=false`, and shows the plan in the session before pushing. The rules of `docs/process/code-changes.md` rule 19 extend to these profiles: read only, a denied command is reported.

## Verification

After the owner's apply of a root, the agent reads the account through its `audit-heat-<environment>` profile, which may read IAM and budgets: the provider; both roles with their trust documents, attachments and inline policies as described above; the boundary's and the freeze policy's documents; the budget's role; the budget with its limit, period and three notifications; and that nothing else was created. The audit role cannot read budget actions (`budgets:DescribeBudgetAction*` is outside its grant), so the action is verified from the owner's apply output and the console. The apply roles are verified by the `Verify apply roles` workflow, run by the owner from the Actions tab: under `dev` asking for `dev`'s role it prints the role's identity, and under `dev` asking for `prod`'s role it fails to assume. A `workflow_dispatch` workflow can only be triggered once it is on the default branch (GitHub, "Manually running a workflow", read 2026-10-16), so that run follows the merge, and its result is recorded as a comment on the pull request. The plan role is verified by the agent assuming it through its profile and reading its identity, once the permission set allows it. The status line at the top of this file changes after the owner's apply and the agent's reads, in a commit on the same branch (`docs/process/code-changes.md`, rule 25). The agent cannot plan this stack: the plan role may read only the environments' state, and the audit role none.

## Facts checked

What Issue-36 rests on, all read 2026-10-16, is listed under "Facts checked" in decision 0019. From Issue-12 and Issue-21, read 2026-10-15, still relied on:

- **The subject format.** GitHub, "OpenID Connect reference": repositories created after 2026-07-15 use `repo:OWNER@OWNER-ID/REPO@REPO-ID`, and an environment job's subject ends `:environment:NAME`. This repository's prefix, from `gh api repos/Heroic-Enterprise-Adventure-Time/HEAT/actions/oidc/customization/sub`: `use_immutable_subject` true, prefix as written in the module's `locals.tf`.
- **No thumbprint.** The `aws_iam_openid_connect_provider` resource documentation says `thumbprint_list` is optional and that for GitHub, among others, AWS validates against its own library of trusted root CAs and does not use a configured list. The IAM user guide, "Create an OpenID Connect identity provider in IAM", says the same.
- **Creating the environment.** `PUT /repos/{owner}/{repo}/environments/{name}` with an empty body creates or updates it (GitHub REST, "Deployment environments").
- **Budgets.** Alerts go to up to ten addresses and one SNS topic each; actual alerts are sent once per budget per period; forecasts need about five weeks of data (AWS Cost Management user guide, "Best practices for AWS Budgets").
- **Declarative policies.** AWS Organizations, "Amazon S3 policies": an S3 declarative policy sets all four Block Public Access settings for the accounts in scope and overrides the account-level setting while attached. "EC2 policies" lists the supported attributes, and EBS encryption by default is not among them.
- **Moving resources into a module.** A `moved` block from a root address to a module address makes Terraform update the state address instead of destroying and recreating (Terraform language documentation, "Refactoring").

## Lock file

Each root commits its `.terraform.lock.hcl`, pinning provider versions and hashes for Windows and Linux, so the owner's machine and the pipeline resolve the same provider. Regenerated in the root with:

```powershell
terraform providers lock -platform=windows_amd64 -platform=linux_amd64
```
