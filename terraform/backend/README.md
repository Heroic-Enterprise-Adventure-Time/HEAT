# The backend stack

Creates the S3 bucket that holds the Terraform state of every stack in this repository, and stores its own state there. Design and the alternatives not chosen: `docs/decisions/0008-terraform-state-backend.md`. The stack is a copy of the one in the `dcg-platform` repository, with the one difference that the account id is a variable, because this repository does not commit account ids.

**Status: not applied.** Nothing exists in AWS yet. This line changes in the pull request that follows the first apply.

## What it manages

One bucket, `heat-platform-terraform-state`, in the `heat-platform` AWS account, us-east-1: versioning, SSE-S3 encryption, public access block, bucket-owner-enforced ownership, a policy denying requests that are not over TLS, and a lifecycle rule expiring old state versions after 90 days. Nothing else. Locking uses S3's own lock files; there is no DynamoDB table.

State keys, one per stack:

| Stack | Key |
| --- | --- |
| `terraform/backend` | `backend/terraform.tfstate` |
| `terraform/bootstrap` (next) | `bootstrap/terraform.tfstate` |

## The account id

The provider refuses credentials for any account but `heat-platform`, and it learns that account's id from the variable `platform_account_id`. The id is not in any committed file. Give it one of two ways, from this directory:

- A file `terraform.tfvars` beside this README, copied from `terraform.tfvars.example` with the real id. Git ignores it.
- The environment variable `TF_VAR_platform_account_id`.

The id itself is in `docs/private/dcg-platform-handoff.md`.

## Who applies it

The project owner, from PowerShell, with the `heat-platform` account's `Admin` credentials from the Identity Center access portal, set as environment variables in the terminal. The provider refuses credentials for any other account. The agent never applies anything (rules 18 and 19 of `docs/process/code-changes.md`).

## First apply

The bucket does not exist yet, so the first apply has to use local state. An override file switches the backend to local for that one apply, and is deleted afterwards. Override files are ignored by git. Every command runs in this directory; Terraform in any other directory reports "No changes" against an empty configuration, which is the first snag `dcg-platform` hit.

```powershell
Remove-Item Env:AWS_ACCESS_KEY_ID, Env:AWS_SECRET_ACCESS_KEY, Env:AWS_SESSION_TOKEN -ErrorAction SilentlyContinue
# paste the heat-platform Admin block from the access portal, then:
aws sts get-caller-identity --query Account --output text   # must print the heat-platform id
cd C:\Users\chanc\IdeaProjects\HEAT\terraform\backend

# 1. Local state for the bootstrap. The block must span lines: HCL does not
#    allow a nested block inside a single-line block.
@'
terraform {
  backend "local" {}
}
'@ | Set-Content -Path backend_override.tf -Encoding ascii
terraform init
terraform plan -out bootstrap.tfplan
```

Read the plan: `Plan: 7 to add, 0 to change, 0 to destroy.` One bucket and six configuration resources, nothing destroyed. Then:

```powershell
terraform apply bootstrap.tfplan

# 2. Move the state into the bucket it just created
Remove-Item backend_override.tf
terraform init -migrate-state
```

`init -migrate-state` asks once to confirm copying the local state to S3. Answer yes. Then:

```powershell
terraform plan
Remove-Item terraform.tfstate, terraform.tfstate.backup, bootstrap.tfplan -ErrorAction SilentlyContinue
```

The plan must say no changes. The local state files are deleted because the state now lives in the bucket; they are ignored by git regardless.

## Every later apply

```powershell
# heat-platform Admin credentials in the environment, confirmed with get-caller-identity
cd C:\Users\chanc\IdeaProjects\HEAT\terraform\backend
terraform init
terraform plan
terraform apply
```

## Verification by the agent

With the `audit-heat-platform` profile: the bucket exists with versioning enabled, default encryption AES256 with the bucket key on, all four public access block settings on, ownership `BucketOwnerEnforced`, the lifecycle rule at 90 and 7 days, the TLS-only policy attached and the bucket not public, the three tags, and the object `backend/terraform.tfstate` present. The audit role cannot read the object's contents; `terraform plan` showing no changes is the check that the state is whole.

## Lock file

`.terraform.lock.hcl` is committed. It pins provider versions and hashes for Windows and Linux, so the owner's machine and a future pipeline resolve the same provider. It is regenerated with:

```powershell
terraform providers lock -platform=windows_amd64 -platform=linux_amd64
```
