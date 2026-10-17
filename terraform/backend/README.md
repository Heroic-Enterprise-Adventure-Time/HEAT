# The backend stack

Creates the S3 bucket that holds the Terraform state of every stack in this repository, and stores its own state there. Design and the alternatives not chosen: `docs/decisions/0008-terraform-state-backend.md`. The stack is a copy of the one in the `dcg-platform` repository, with the one difference that the account id is a variable, because this repository does not commit account ids.

**Status: applied 2026-10-14 and verified; the per-account statements of the bucket policy (Issue-36) are written and not yet applied.** The bucket exists with every setting below, and this stack's state is in it at `backend/terraform.tfstate`. The policy in force on 2026-10-16, read through `audit-heat-platform`, is the TLS-only deny alone. Verified by the agent through the `audit-heat-platform` profile after the owner's bootstrap: versioning enabled, AES256 with the bucket key on, all four public access block settings on, ownership `BucketOwnerEnforced`, the lifecycle rule at 90 and 7 days, the TLS-only policy attached and the bucket not public, the three tags, the state object present, and no other bucket in the account. The agent cannot read the object's contents; the owner's `terraform plan` after the migration is the check that the state is whole, and it reported no changes. The owner's report of the first run: the bootstrap apply was clean, the migration to the S3 backend was clean, and the final plan showed no changes. No snags; the sequence in "First apply" ran as written.

## What it manages

One bucket, `heat-platform-terraform-state`, in the `heat-platform` AWS account, us-east-1: versioning, SSE-S3 encryption, public access block, bucket-owner-enforced ownership, a bucket policy, and a lifecycle rule expiring old state versions after 90 days. Nothing else. Locking uses S3's own lock files; there is no DynamoDB table.

The bucket policy denies every request that is not over TLS and, per workload account listed in `workload_account_ids`, grants that account's two roles from the `bootstrap` stack their environment's prefix: `heat-<environment>-plan` and `heat-<environment>-apply` may list the bucket under the prefix (and under `env:/`, the workspace prefix Terraform looks at and this repository never uses) and read objects under it; the apply role may also write and delete there, which the lock file needs (decisions 0017 and 0019). The statements name the roles by ARN, so an account's bootstrap root is applied before the account is listed here; IAM refuses a principal that does not exist. If a named role is ever deleted and recreated, IAM keeps the old role's unique id in the policy and the statement stops matching; the next plan of this stack shows the drift and the apply repairs it.

State keys, one per stack and environment. The bootstrap and backend keys are outside every granted prefix and stay the owner's:

| Stack | Key |
| --- | --- |
| `terraform/backend` | `backend/terraform.tfstate` |
| `terraform/bootstrap`, per account | `bootstrap/<environment>/terraform.tfstate` |
| `terraform/environment`, dev and prod (Issue-40, Issue-41) | `environment/<environment>/terraform.tfstate` |
| `terraform/environment/sandbox-base` (Issue-37) | `environment/sandbox/base/terraform.tfstate` |
| `terraform/environment/sandbox`, per issue (Issue-38) | `environment/sandbox/<issue>/terraform.tfstate` |

## The account ids

The provider refuses credentials for any account but `heat-platform`, and it learns that account's id from the variable `platform_account_id`. The workload accounts whose roles the policy grants come from `workload_account_ids`, a map keyed `sandbox`, `dev`, `prod`, holding only the accounts whose bootstrap root is applied. No id is in any committed file. Give them one of two ways, from this directory:

- A file `terraform.tfvars` beside this README, copied from `terraform.tfvars.example` with the real ids. Git ignores it, so a worktree would need its own copy.
- The environment variables `TF_VAR_platform_account_id` and `TF_VAR_workload_account_ids`, the latter as an HCL map. The private script in `docs/private/` that `terraform/bootstrap/README.md` describes sets both, with the map listing the accounts whose bootstrap root is applied; this needs no file in any worktree. A file in the root, if present, wins over the environment.

The ids themselves are in `docs/private/dcg-platform-handoff.md`.

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
cd <the checkout or worktree>\terraform\backend
terraform init
terraform plan -out backend.tfplan
```

Read the plan. The pull request that changes the stack says what line to expect; adding an account to `workload_account_ids` is `Plan: 0 to add, 1 to change, 0 to destroy.`, the bucket policy and nothing else. Then `terraform apply backend.tfplan` and `Remove-Item backend.tfplan`.

## Verification by the agent

With the `audit-heat-platform` profile: the bucket exists with versioning enabled, default encryption AES256 with the bucket key on, all four public access block settings on, ownership `BucketOwnerEnforced`, the lifecycle rule at 90 and 7 days, the policy attached with the TLS-only deny and the three statements per listed account, the bucket not public, the three tags, and the object `backend/terraform.tfstate` present. The audit role cannot read the object's contents; `terraform plan` showing no changes is the check that the state is whole.

## Lock file

`.terraform.lock.hcl` is committed. It pins provider versions and hashes for Windows and Linux, so the owner's machine and a future pipeline resolve the same provider. It is regenerated with:

```powershell
terraform providers lock -platform=windows_amd64 -platform=linux_amd64
```
