# The bootstrap stack

Creates, in a workload account, what the account needs before anything runs in it: the GitHub OIDC identity provider and one narrow deploy role, so GitHub Actions can deploy code there, and a monthly cost budget with alerts. One root directory per environment, `dev/` today and `prod/` when `heat-prod` is bootstrapped, each composing the module `terraform/modules/bootstrap` with that environment's values as literals and keeping its own state key (decision 0016). Design: `docs/architecture/overview.md`, "Environments"; decisions 0008, 0011, 0012 and 0016. The dev slice is issue #12, the budget issue #19, the root-per-environment layout issue #21.

**Status: `dev` applied by the owner on 2026-10-15 and verified, in the root-per-environment layout since 2026-10-16.** State is at `bootstrap/dev/terraform.tfstate` in the platform bucket. The move into the module (#21) was applied by the owner as four moves and zero changes; read back through `audit-heat-dev` afterwards, the provider, the role, its policy and the budget are unchanged down to their creation times, and the only new object is the state version the apply wrote. Verified by the agent through the `audit-heat-dev` profile on 2026-10-15: the provider exists with the URL and the single audience `sts.amazonaws.com`; the role `heat-dev-deploy` exists with the trust document exactly as written, a one-hour session, no managed policy and the one inline policy with the six actions on `function:heat-dev-*`; the budget `heat-dev-monthly-cost` exists, monthly, 10 USD, with three notifications each to one email subscriber, all in state OK; nothing else was created, and everything carries the three tags. IAM recorded a thumbprint on the provider by itself; Terraform set none, and for GitHub it is not used (see "Facts checked"). Nothing exists yet for `heat-prod`.

## Layout

| Path | Holds |
| --- | --- |
| `terraform/modules/bootstrap/` | The resources, parameterised by environment: provider, role and policy, budget |
| `terraform/bootstrap/dev/` | The dev root: backend block with the key `bootstrap/dev/terraform.tfstate`, the two providers, one module call with dev's literals, the lock file, four `moved` blocks from the layout before #21 |
| `terraform/bootstrap/dev/terraform.tfvars` | Ignored by git: the platform account id, the workload account id, the alert address. Copied once from `terraform.tfvars.example` |

A second environment is a second directory beside `dev/`: its own backend key, its own literals, its own ignored `terraform.tfvars`, no `moved` blocks. No flag selects an environment; the directory does.

## What it manages

In the workload account named by the root's `workload_account_id`:

- **The GitHub OIDC provider**: URL `https://token.actions.githubusercontent.com`, audience `sts.amazonaws.com`, no thumbprint (see "Facts checked").
- **The role `heat-<environment>-deploy`.** Trust: `sts:AssumeRoleWithWebIdentity` from that provider, with `aud` equal to `sts.amazonaws.com` and `sub` equal to exactly this repository's immutable subject for the GitHub environment: `repo:Heroic-Enterprise-Adventure-Time@339832417/HEAT@1410947079:environment:<github_environment>`. Permissions: update function code, publish versions, read the function and its configuration, read and move aliases, on functions named `heat-<environment>-*` in us-east-1 in that account. Nothing else. The functions, their roles, triggers and aliases are the environment stack's.
- **The budget `heat-<environment>-monthly-cost`.** A monthly cost budget of the root's `monthly_budget_usd` (dev: 10), with three email alerts to `budget_alert_email`: actual spend above 50%, actual spend above 80%, forecasted spend above 100%. Actual alerts fire once per threshold per month; the forecast alert starts once AWS has about five weeks of usage data. Budgets with notifications are free, and there are no budget actions. Ten dollars for dev because the serverless environment idles near one dollar a month, so ten catches a runaway early and leaves room for experiments.

Nothing is created in `heat-platform`. The stack runs there and keeps its state there.

## What it does not manage

Each line says what is in force in `heat-dev` today, read through the `audit-heat-dev` profile on 2026-10-15, and what that leaves open.

- **Account-level S3 public access block.** Not set, and not this stack's to set. It belongs to the organization layer as an AWS Organizations declarative policy for Amazon S3, which turns on all four settings for every account in scope, is inherited by new accounts and locks the account-level setting; owed on the `dcg-platform` side. Checked 2026-10-15 that no such policy exists yet. Until it does, the account has no buckets, and the environment stack puts a block on every bucket it creates.
- **EBS default encryption.** Off, and dropped. There is no declarative policy attribute for it, and HEAT has no instances, volumes or VPC (decision 0013), so it would govern nothing.
- **IAM password policy.** None. The organization's controls deny creating IAM users, so there is nothing for it to govern.
- **GuardDuty.** A detector exists in `heat-dev`, created by the organization's delegated administrator. Nothing for HEAT to do.
- **IAM Access Analyzer.** No analyzer in `heat-dev`. The organization-level analyzer is `dcg-platform`'s; this stack adds none.
- **Log group retention.** The environment stack sets retention on each log group it creates.
- **The prod account.** `prod/` is added when `heat-prod` is bootstrapped.
- **The platform deploy role in `heat-platform`.** Needed only when a pipeline applies Terraform (`docs/process/code-changes.md`, rule 18). Until then the owner's `Admin` session is the only identity `PlatformAdminRole` trusts, and widening that trust is a change in `dcg-platform` first.
- **An artifact bucket.** None. Bundles are uploaded straight to the function; each is far under Lambda's 50 MB direct-upload limit (decision 0012).

## Values that stay out of git

Three per root: the platform account id and the workload account id (`docs/README.md`, rule 9), and the alert address. They live in the root's `terraform.tfvars`, which git ignores along with every `*.auto.tfvars`; Terraform loads it on every run. The same three can come from the environment as `TF_VAR_platform_account_id`, `TF_VAR_workload_account_id` and `TF_VAR_budget_alert_email`, which is how a pipeline will supply them from the GitHub repository variables.

## Who applies it

The project owner, from PowerShell, with the `heat-platform` account's `Admin` credentials from the Identity Center access portal set as environment variables. The default provider refuses any other account. The stack reaches the workload account by assuming `PlatformAdminRole` there, which trusts that `Admin` role. The agent never applies anything (`docs/process/code-changes.md`, rules 18 and 19).

## Applying

Three repository variables carry the ids and the role ARN for the deploy workflow (decision 0011): `HEAT_PLATFORM_ACCOUNT_ID`, `HEAT_DEV_ACCOUNT_ID` and `HEAT_DEV_DEPLOY_ROLE_ARN`. All three are set. The GitHub environment `dev`, which the role's trust names and in which the deploy workflow (issue #14) runs its jobs, exists.

Once, create `terraform.tfvars` in the root from its example. Then, for every apply:

```powershell
Remove-Item Env:AWS_ACCESS_KEY_ID, Env:AWS_SECRET_ACCESS_KEY, Env:AWS_SESSION_TOKEN -ErrorAction SilentlyContinue
# paste the heat-platform Admin block from the access portal, then:
aws sts get-caller-identity --query Account --output text   # must print the heat-platform id
cd C:\Users\chanc\IdeaProjects\HEAT\terraform\bootstrap\dev
terraform init
terraform plan -out dev.tfplan
```

Read the plan. The pull request that changes the stack says what line to expect. Anything else: stop and paste the plan into the session. Then:

```powershell
terraform apply dev.tfplan
Remove-Item dev.tfplan
```

Two things learned on the first applies, 2026-10-15. PowerShell splits a `-flag=value` argument at a dot in the value, so a flag that takes a value is written with a space, as `-out dev.tfplan` is. And a value piped into `gh variable set` arrived with a UTF-8 byte-order mark in front of it; if a repository variable ever has to be set from an output, pass it as an argument: `gh variable set NAME --body (terraform output -raw NAME)`.

## Verification by the agent

After the owner's apply, with the `audit-heat-dev` profile, which may read IAM and budgets: the provider, the role, its trust document and its one inline policy as described above; the budget with its limit, period and three notifications. The status line at the top of this file then changes, in a commit on the same branch (`docs/process/code-changes.md`, rule 25). The agent cannot plan: the audit role can neither read the state nor assume `PlatformAdminRole`.

## Facts checked before the code was written

All read 2026-10-15.

- **The subject format.** GitHub, "OpenID Connect reference" (`docs.github.com/en/actions/reference/security/oidc`): repositories created after 2026-07-15 use `repo:OWNER@OWNER-ID/REPO@REPO-ID`, and an environment job's subject ends `:environment:NAME`. This repository's prefix, from `gh api repos/Heroic-Enterprise-Adventure-Time/HEAT/actions/oidc/customization/sub`: `use_immutable_subject` true, prefix as written in the module's `deploy_role.tf`.
- **No thumbprint.** The `aws_iam_openid_connect_provider` resource documentation says `thumbprint_list` is optional and that for GitHub, among others, AWS validates against its own library of trusted root CAs and does not use a configured list. The IAM user guide, "Create an OpenID Connect identity provider in IAM", says the same.
- **The waiter.** `aws lambda wait function-updated-v2` polls `GetFunction` once a second (AWS CLI reference), so the role needs `lambda:GetFunction`.
- **Resource patterns.** A pattern ending in `*` matches a function's unqualified and qualified ARNs; one ending in the name matches the unqualified ARN only (Lambda developer guide, "Fine-tuning the Resources and Conditions sections of policies").
- **Creating the environment.** `PUT /repos/{owner}/{repo}/environments/{name}` with an empty body creates or updates it (GitHub REST, "Deployment environments").
- **Budgets.** Alerts go to up to ten addresses and one SNS topic each; actual alerts are sent once per budget per period; forecasts need about five weeks of data (AWS Cost Management user guide, "Best practices for AWS Budgets"). Budgets with notifications are free; only action-enabled budgets beyond the first two cost $0.10 a day (AWS Budgets pricing). The `aws_budgets_budget` resource takes `budget_type`, `limit_amount` as a string, `limit_unit`, `time_unit` and `notification` blocks (provider documentation).
- **Declarative policies.** AWS Organizations, "Amazon S3 policies": an S3 declarative policy sets all four Block Public Access settings for the accounts in scope, new accounts inherit it, and it overrides the account-level setting while attached. "EC2 policies" lists the supported attributes, and EBS encryption by default is not among them.
- **Moving resources into a module.** A `moved` block from a root address to a module address makes Terraform update the state address instead of destroying and recreating; the plan reports the move and the apply records it (Terraform language documentation, "Refactoring").
- **`heat-dev` on 2026-10-15.** Before #12: no OIDC provider; the only Lambda function is Control Tower's notification forwarder; `PlatformAdminRole` present; the account settings listed under "What it does not manage". Before #19: no budget.

## Lock file

Each root commits its `.terraform.lock.hcl`, pinning provider versions and hashes for Windows and Linux, so the owner's machine and a future pipeline resolve the same provider. Regenerated in the root with:

```powershell
terraform providers lock -platform=windows_amd64 -platform=linux_amd64
```
