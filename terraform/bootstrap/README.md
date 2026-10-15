# The bootstrap stack

Creates, in a workload account, what the account needs before anything runs in it: the GitHub OIDC identity provider and one narrow deploy role, so GitHub Actions can deploy code there, and a monthly cost budget with alerts. One configuration, applied once per environment with that environment's backend file and variable file. Design: `docs/architecture/overview.md`, "Environments"; decisions 0008, 0011 and 0012. The dev slice is issue #12; the budget is issue #19.

**Status: dev slice (#12) and its budget (#19) applied by the owner on 2026-10-15 and verified.** State is at `bootstrap/dev/terraform.tfstate` in the platform bucket. The budget apply was one addition with the provider and the role unchanged; read back through `audit-heat-dev`: `heat-dev-monthly-cost`, cost, monthly, 10 USD, period started at the first of the month, three notifications (actual above 50%, actual above 80%, forecast above 100%) each with one email subscriber, all in state OK. The #12 resources, verified by the agent through the same profile earlier that day: the provider exists with the URL and the single audience `sts.amazonaws.com`; the role `heat-dev-deploy` exists with the trust document exactly as written, a one-hour session, no managed policy and the one inline policy with the six actions on `function:heat-dev-*`; it is the only role created that day, and both carry the three tags. IAM recorded a thumbprint on the provider by itself; Terraform set none, and for GitHub it is not used (see "Facts checked"). Two snags on the first run, both fixed in the same pull request: PowerShell split the `-flag=value` arguments, and the piped role ARN reached GitHub with a byte-order mark. Nothing exists yet for `heat-prod`.

## What it manages

In the workload account that `workload_account_ids` names for `environment`:

- **The GitHub OIDC provider**: URL `https://token.actions.githubusercontent.com`, audience `sts.amazonaws.com`, no thumbprint (see "Facts checked").
- **The role `heat-<environment>-deploy`.** Trust: `sts:AssumeRoleWithWebIdentity` from that provider, with `aud` equal to `sts.amazonaws.com` and `sub` equal to exactly this repository's immutable subject for the GitHub environment: `repo:Heroic-Enterprise-Adventure-Time@339832417/HEAT@1410947079:environment:<github_environment>`. Permissions: update function code, publish versions, read the function and its configuration, read and move aliases, on functions named `heat-<environment>-*` in us-east-1 in that account. Nothing else. The functions, their roles, triggers and aliases are the environment stack's.
- **The budget `heat-<environment>-monthly-cost`.** A monthly cost budget of `monthly_budget_usd` dollars (dev: 10), with three email alerts to `budget_alert_email`: actual spend above 50%, actual spend above 80%, forecasted spend above 100%. Actual alerts fire once per threshold per month; the forecast alert starts once AWS has about five weeks of usage data. Budgets with notifications are free, and there are no budget actions. Ten dollars for dev because the serverless environment idles near one dollar a month, so ten catches a runaway early and leaves room for experiments.

Nothing is created in `heat-platform`. The stack runs there and keeps its state there.

## What it does not manage

Each line says what is in force in `heat-dev` today, read through the `audit-heat-dev` profile on 2026-10-15, and what that leaves open.

- **Account-level S3 public access block.** Not set, and not this stack's to set. It belongs to the organization layer as an AWS Organizations declarative policy for Amazon S3, which turns on all four settings for every account in scope, is inherited by new accounts and locks the account-level setting; owed on the `dcg-platform` side. Checked 2026-10-15 that no such policy exists yet. Until it does, the account has no buckets, and the environment stack puts a block on every bucket it creates.
- **EBS default encryption.** Off, and dropped. There is no declarative policy attribute for it, and HEAT has no instances, volumes or VPC (decision 0013), so it would govern nothing.
- **IAM password policy.** None. The organization's controls deny creating IAM users, so there is nothing for it to govern.
- **GuardDuty.** A detector exists in `heat-dev`, created by the organization's delegated administrator. Nothing for HEAT to do.
- **IAM Access Analyzer.** No analyzer in `heat-dev`. The organization-level analyzer is `dcg-platform`'s; this stack adds none.
- **Log group retention.** The environment stack sets retention on each log group it creates.
- **The prod account.** `prod.tfvars` and `prod.s3.tfbackend` are added when `heat-prod` is bootstrapped.
- **The platform deploy role in `heat-platform`.** Needed only when a pipeline applies Terraform (`docs/process/code-changes.md`, rule 18). Until then the owner's `Admin` session is the only identity `PlatformAdminRole` trusts, and widening that trust is a change in `dcg-platform` first.
- **An artifact bucket.** None. Bundles are uploaded straight to the function; each is far under Lambda's 50 MB direct-upload limit (decision 0012).

## Values that stay out of git, and the environment files

Three values are never committed: the platform account id and the workload account ids (`docs/README.md`, rule 9), and the alert address. They live in `terraform.tfvars`, copied from `terraform.tfvars.example`, which git ignores. Terraform loads that file on every run whatever environment is being applied, so the workload ids are a map keyed by environment name and the environment's own file selects the entry; one id in that file would be silently wrong for the other environment. The same three values can come from the environment as `TF_VAR_platform_account_id`, `TF_VAR_workload_account_ids` (a map, as HCL) and `TF_VAR_budget_alert_email`, which is how a pipeline will supply them from the GitHub repository variables; the first apply used that form for the ids.

Two committed files per environment, holding nothing private:

| File | Holds | Used by |
| --- | --- | --- |
| `dev.s3.tfbackend` | the state key `bootstrap/dev/terraform.tfstate` | `terraform init -reconfigure -backend-config dev.s3.tfbackend` |
| `dev.tfvars` | `environment`, `github_environment`, `monthly_budget_usd` | `terraform plan -var-file dev.tfvars` |

Git ignores `terraform.tfvars` and `*.auto.tfvars`, the files Terraform loads unasked, and no other `.tfvars` file. The rule was narrowed from `*.tfvars` with this stack so that the per-environment file can be committed.

## Who applies it

The project owner, from PowerShell, with the `heat-platform` account's `Admin` credentials from the Identity Center access portal set as environment variables. The default provider refuses any other account. The stack reaches the workload account by assuming `PlatformAdminRole` there, which trusts that `Admin` role. The agent never applies anything (`docs/process/code-changes.md`, rules 18 and 19).

## Applying

Three repository variables carry the ids and the role ARN for the deploy workflow (decision 0011): `HEAT_PLATFORM_ACCOUNT_ID`, `HEAT_DEV_ACCOUNT_ID` and `HEAT_DEV_DEPLOY_ROLE_ARN`. All three are set. The GitHub environment `dev`, which the role's trust names and in which the deploy workflow (issue #14) runs its jobs, exists.

Once, create `terraform.tfvars` in this directory from the example with the platform id, the workload ids by environment and the alert address. Then, for every apply:

```powershell
Remove-Item Env:AWS_ACCESS_KEY_ID, Env:AWS_SECRET_ACCESS_KEY, Env:AWS_SESSION_TOKEN -ErrorAction SilentlyContinue
# paste the heat-platform Admin block from the access portal, then:
aws sts get-caller-identity --query Account --output text   # must print the heat-platform id
cd C:\Users\chanc\IdeaProjects\HEAT\terraform\bootstrap
terraform init -reconfigure -backend-config dev.s3.tfbackend
terraform plan -var-file dev.tfvars -out dev.tfplan
```

`-reconfigure` every time, because one directory remembers one backend. Without it, an init that names a different environment's backend file stops with "backend configuration changed" and asks for `-migrate-state` or `-reconfigure`; `-migrate-state` would copy one environment's state under the other's key. `-reconfigure` disregards the remembered configuration and never migrates state (Terraform CLI documentation, `init`, read 2026-10-15). The variable file and the backend file must name the same environment; nothing checks that for you, so read the plan's resource names.

The flags take a space, not `=`. PowerShell splits `-backend-config=dev.s3.tfbackend` at a dot in the value and Terraform then reports too many arguments; seen on the first run, 2026-10-15, and the space form checked in PowerShell the same day.

Read the plan. The pull request that changes the stack says what line to expect; for the budget it is `Plan: 1 to add, 0 to change, 0 to destroy.` Anything else: stop and paste the plan into the session. Then:

```powershell
terraform apply dev.tfplan
Remove-Item dev.tfplan
```

If a repository variable ever has to be set from an output, pass the output as an argument, not through a pipe: `gh variable set NAME --body (terraform output -raw NAME)`. On the first run the piped value reached GitHub with a UTF-8 byte-order mark in front of the ARN, which the deploy workflow would have handed to AWS as part of the role name; seen 2026-10-15 and reset with the argument form.

## Verification by the agent

After the owner's apply, with the `audit-heat-dev` profile, which may read IAM and budgets: the provider, the role, its trust document and its one inline policy as described above; the budget with its limit, period and three notifications. The status line at the top of this file then changes, in a commit on the same branch (`docs/process/code-changes.md`, rule 25). The agent cannot plan: the audit role can neither read the state nor assume `PlatformAdminRole`.

## Facts checked before the code was written

All read 2026-10-15.

- **The subject format.** GitHub, "OpenID Connect reference" (`docs.github.com/en/actions/reference/security/oidc`): repositories created after 2026-07-15 use `repo:OWNER@OWNER-ID/REPO@REPO-ID`, and an environment job's subject ends `:environment:NAME`. This repository's prefix, from `gh api repos/Heroic-Enterprise-Adventure-Time/HEAT/actions/oidc/customization/sub`: `use_immutable_subject` true, prefix as written in `deploy_role.tf`.
- **No thumbprint.** The `aws_iam_openid_connect_provider` resource documentation says `thumbprint_list` is optional and that for GitHub, among others, AWS validates against its own library of trusted root CAs and does not use a configured list. The IAM user guide, "Create an OpenID Connect identity provider in IAM", says the same.
- **The waiter.** `aws lambda wait function-updated-v2` polls `GetFunction` once a second (AWS CLI reference), so the role needs `lambda:GetFunction`.
- **Resource patterns.** A pattern ending in `*` matches a function's unqualified and qualified ARNs; one ending in the name matches the unqualified ARN only (Lambda developer guide, "Fine-tuning the Resources and Conditions sections of policies").
- **Creating the environment.** `PUT /repos/{owner}/{repo}/environments/{name}` with an empty body creates or updates it (GitHub REST, "Deployment environments").
- **Budgets.** Alerts go to up to ten addresses and one SNS topic each; actual alerts are sent once per budget per period; forecasts need about five weeks of data (AWS Cost Management user guide, "Best practices for AWS Budgets"). Budgets with notifications are free; only action-enabled budgets beyond the first two cost $0.10 a day (AWS Budgets pricing). The `aws_budgets_budget` resource takes `budget_type`, `limit_amount` as a string, `limit_unit`, `time_unit` and `notification` blocks with `comparison_operator`, `threshold`, `threshold_type`, `notification_type` and `subscriber_email_addresses` (provider documentation).
- **Declarative policies.** AWS Organizations, "Amazon S3 policies": an S3 declarative policy sets all four Block Public Access settings for the accounts in scope, new accounts inherit it, and it overrides the account-level setting while attached. "EC2 policies" lists the supported attributes, and EBS encryption by default is not among them.
- **`heat-dev` on 2026-10-15.** Before #12: no OIDC provider; the only Lambda function is Control Tower's notification forwarder; `PlatformAdminRole` present; the account settings listed under "What it does not manage". Before #19: no budget.

## Lock file

`.terraform.lock.hcl` is committed and pins provider versions and hashes for Windows and Linux, so the owner's machine and a future pipeline resolve the same provider. Regenerated with:

```powershell
terraform providers lock -platform=windows_amd64 -platform=linux_amd64
```
