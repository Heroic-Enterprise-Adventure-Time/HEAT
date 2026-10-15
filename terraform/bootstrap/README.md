# The bootstrap stack

Creates, in a workload account, what GitHub Actions needs in order to deploy code there: the GitHub OIDC identity provider and one narrow deploy role. One configuration, applied once per environment with that environment's backend file and variable file. Design: `docs/architecture/overview.md`, "Environments"; decisions 0008, 0011 and 0012. The dev slice is issue #12.

**Status: dev slice applied by the owner on 2026-10-15 and verified.** State is at `bootstrap/dev/terraform.tfstate` in the platform bucket. Verified by the agent through the `audit-heat-dev` profile the same day: the provider exists with the URL and the single audience `sts.amazonaws.com`; the role `heat-dev-deploy` exists with the trust document exactly as written, a one-hour session, no managed policy and the one inline policy with the six actions on `function:heat-dev-*`; it is the only role created that day, and both carry the three tags. IAM recorded a thumbprint on the provider by itself; Terraform set none, and for GitHub it is not used (see "Facts checked"). Two snags on the first run, both fixed in the same pull request: PowerShell split the `-flag=value` arguments, and the piped role ARN reached GitHub with a byte-order mark. Nothing exists yet for `heat-prod`.

## What it manages

In the workload account named by `workload_account_id`:

- **The GitHub OIDC provider**: URL `https://token.actions.githubusercontent.com`, audience `sts.amazonaws.com`, no thumbprint (see "Facts checked").
- **The role `heat-<environment>-deploy`.** Trust: `sts:AssumeRoleWithWebIdentity` from that provider, with `aud` equal to `sts.amazonaws.com` and `sub` equal to exactly this repository's immutable subject for the GitHub environment: `repo:Heroic-Enterprise-Adventure-Time@339832417/HEAT@1410947079:environment:<github_environment>`. Permissions: update function code, publish versions, read the function and its configuration, read and move aliases, on functions named `heat-<environment>-*` in us-east-1 in that account. Nothing else. The functions, their roles, triggers and aliases are the environment stack's.

Nothing is created in `heat-platform`. The stack runs there and keeps its state there.

## What it does not manage yet

Deferred from the dev slice so that the pull request has one purpose. Each line says what is in force in `heat-dev` today, read through the `audit-heat-dev` profile on 2026-10-15, and what the deferral leaves open.

- **Account-level S3 public access block.** Not set. The account has no buckets, so nothing is exposed; the environment stack puts a block on every bucket it creates. The account-level block comes in the next bootstrap slice.
- **EBS default encryption.** Off. No instance or volume exists, and the design has none.
- **IAM password policy.** None. The organization's controls deny creating IAM users, so there is nothing for it to govern.
- **Budgets.** None. Nothing deployed costs money yet. Until a budget exists an unexpected bill is noticed at the invoice, so a budget belongs in place before the environment stack is applied.
- **GuardDuty.** A detector exists in `heat-dev`, created by the organization's delegated administrator. Nothing for HEAT to do.
- **IAM Access Analyzer.** No analyzer in `heat-dev`. The organization-level analyzer is `dcg-platform`'s; this stack adds none.
- **Log group retention.** The environment stack sets retention on each log group it creates.
- **The prod account.** `prod.tfvars` and `prod.s3.tfbackend` are added when `heat-prod` is bootstrapped.
- **The platform deploy role in `heat-platform`.** Needed only when a pipeline applies Terraform (`docs/process/code-changes.md`, rule 18). Until then the owner's `Admin` session is the only identity `PlatformAdminRole` trusts, and widening that trust is a change in `dcg-platform` first.
- **An artifact bucket.** None. Bundles are uploaded straight to the function; each is far under Lambda's 50 MB direct-upload limit (decision 0012).

## Account ids and environment files

Two ids, never committed (`docs/README.md`, rule 9): `platform_account_id` and `workload_account_id`. Give them as `TF_VAR_*` environment variables regenerated from the GitHub repository variables, as shown below, or in a `terraform.tfvars` copied from `terraform.tfvars.example`, which git ignores.

Two committed files per environment, holding nothing private:

| File | Holds | Used by |
| --- | --- | --- |
| `dev.s3.tfbackend` | the state key `bootstrap/dev/terraform.tfstate` | `terraform init -backend-config dev.s3.tfbackend` |
| `dev.tfvars` | `environment` and `github_environment` | `terraform plan -var-file dev.tfvars` |

Git ignores `terraform.tfvars` and `*.auto.tfvars`, the files Terraform loads unasked, and no other `.tfvars` file. The rule was narrowed from `*.tfvars` with this stack so that the per-environment file can be committed.

## Who applies it

The project owner, from PowerShell, with the `heat-platform` account's `Admin` credentials from the Identity Center access portal set as environment variables. The default provider refuses any other account. The stack reaches the workload account by assuming `PlatformAdminRole` there, which trusts that `Admin` role. The agent never applies anything (`docs/process/code-changes.md`, rules 18 and 19).

## First apply, dev

Three repository variables carry the ids and the role ARN (decision 0011): `HEAT_PLATFORM_ACCOUNT_ID`, `HEAT_DEV_ACCOUNT_ID` and `HEAT_DEV_DEPLOY_ROLE_ARN`. The first two are set before the apply, the third from its output. The ids are in `docs/private/dcg-platform-handoff.md`. The GitHub environment `dev` is what the role's trust names; the deploy workflow (issue #14) runs its jobs in it.

```powershell
cd C:\Users\chanc\IdeaProjects\HEAT
gh variable set HEAT_PLATFORM_ACCOUNT_ID --body "<heat-platform account id>"
gh variable set HEAT_DEV_ACCOUNT_ID --body "<heat-dev account id>"
gh api --method PUT repos/Heroic-Enterprise-Adventure-Time/HEAT/environments/dev --jq '{name, html_url}'
```

```powershell
Remove-Item Env:AWS_ACCESS_KEY_ID, Env:AWS_SECRET_ACCESS_KEY, Env:AWS_SESSION_TOKEN -ErrorAction SilentlyContinue
# paste the heat-platform Admin block from the access portal, then:
aws sts get-caller-identity --query Account --output text   # must print the heat-platform id
$env:TF_VAR_platform_account_id = gh variable get HEAT_PLATFORM_ACCOUNT_ID
$env:TF_VAR_workload_account_id = gh variable get HEAT_DEV_ACCOUNT_ID
cd C:\Users\chanc\IdeaProjects\HEAT\terraform\bootstrap
terraform init -backend-config dev.s3.tfbackend
terraform plan -var-file dev.tfvars -out dev.tfplan
```

The flags take a space, not `=`. PowerShell splits `-backend-config=dev.s3.tfbackend` at a dot in the value and Terraform then reports too many arguments; seen on the first run, 2026-10-15, and the space form checked in PowerShell the same day.

Read the plan: `Plan: 3 to add, 0 to change, 0 to destroy.` The three are the OIDC provider, the role and its inline policy, all in the workload account. Anything else: stop and paste the plan into the session. Then:

```powershell
terraform apply dev.tfplan
gh variable set HEAT_DEV_DEPLOY_ROLE_ARN --body (terraform output -raw deploy_role_arn)
Remove-Item dev.tfplan
```

The ARN goes in as an argument, not through a pipe. On the first run the piped value reached GitHub with a UTF-8 byte-order mark in front of the ARN, which the deploy workflow would have handed to AWS as part of the role name; seen 2026-10-15 and reset with the form above.

## Every later apply

The same credentials and `TF_VAR_*` as above, then from this directory:

```powershell
terraform init -backend-config dev.s3.tfbackend
terraform plan -var-file dev.tfvars -out dev.tfplan
terraform apply dev.tfplan
Remove-Item dev.tfplan
```

## Verification by the agent

After the owner's apply, with the `audit-heat-dev` profile: the provider exists with the URL and the one audience; the role exists with the trust document above and one inline policy with the six actions on the one resource pattern; nothing else was created. The status line at the top of this file then changes, in a commit on the same branch (`docs/process/code-changes.md`, rule 25). The agent cannot plan: the audit role can neither read the state nor assume `PlatformAdminRole`.

## Facts checked before the code was written

All read 2026-10-15.

- **The subject format.** GitHub, "OpenID Connect reference" (`docs.github.com/en/actions/reference/security/oidc`): repositories created after 2026-07-15 use `repo:OWNER@OWNER-ID/REPO@REPO-ID`, and an environment job's subject ends `:environment:NAME`. This repository's prefix, from `gh api repos/Heroic-Enterprise-Adventure-Time/HEAT/actions/oidc/customization/sub`: `use_immutable_subject` true, prefix as written in `deploy_role.tf`.
- **No thumbprint.** The `aws_iam_openid_connect_provider` resource documentation says `thumbprint_list` is optional and that for GitHub, among others, AWS validates against its own library of trusted root CAs and does not use a configured list. The IAM user guide, "Create an OpenID Connect identity provider in IAM", says the same.
- **The waiter.** `aws lambda wait function-updated-v2` polls `GetFunction` once a second (AWS CLI reference), so the role needs `lambda:GetFunction`.
- **Resource patterns.** A pattern ending in `*` matches a function's unqualified and qualified ARNs; one ending in the name matches the unqualified ARN only (Lambda developer guide, "Fine-tuning the Resources and Conditions sections of policies").
- **Creating the environment.** `PUT /repos/{owner}/{repo}/environments/{name}` with an empty body creates or updates it (GitHub REST, "Deployment environments").
- **`heat-dev` on 2026-10-15.** No OIDC provider; the only Lambda function is Control Tower's notification forwarder; `PlatformAdminRole` present; the account settings listed under "What it does not manage yet".

## Lock file

`.terraform.lock.hcl` is committed and pins provider versions and hashes for Windows and Linux, so the owner's machine and a future pipeline resolve the same provider. Regenerated with:

```powershell
terraform providers lock -platform=windows_amd64 -platform=linux_amd64
```
