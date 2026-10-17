# 0008: Terraform state backend

- **Status:** Decided. Amended by 0017 on 2026-10-16: an environment is applied by HEAT's own role in its workload account, not from `heat-platform`; the state stays in the `heat-platform` bucket. Amended by 0020 on 2026-10-17: the base roots' state holds the Cognito identity provider's client secret; the revisit this record named found the readers unchanged, so SSE-S3 stays.
- **Date:** 2026-10-13

## Decision

Every Terraform stack in this repository stores its state in one S3 bucket, `heat-platform-terraform-state`, in the `heat-platform` AWS account, with one key per stack. The bucket has versioning, SSE-S3 encryption, a public access block, bucket-owner-enforced object ownership, a policy that denies requests not made over TLS, and a lifecycle rule that expires noncurrent versions after 90 days. Locking uses the S3 backend's native lock file. There is no DynamoDB table.

The bucket is created by a small `terraform/backend` stack that then stores its own state in it: the first apply runs with local state through an override file, and `terraform init -migrate-state` moves that state into the bucket.

This is the same design, resource for resource, as decision 0003 in the `dcg-platform` repository, adopted rather than re-derived: the organization's platform account and HEAT's platform account have the same job, and the pipeline that later applies both should find the same shape in both. That record holds the full reasoning and the alternatives considered. Two things are HEAT's own:

- **The account id is a variable, not a literal.** This repository does not commit account ids (`docs/README.md`, rule 9). The provider's `allowed_account_ids` comes from `platform_account_id`, supplied through an ignored `terraform.tfvars` or an environment variable. The bucket name carries no id.
- **Every stack runs from `heat-platform`.** The bootstrap stack that follows reaches `heat-dev` and `heat-prod` by assuming `PlatformAdminRole` there, the role the organization layer placed in each workload account for exactly this (dcg-platform decision 0008). State never leaves `heat-platform`.

## Considered and not chosen

The alternatives weighed in dcg-platform's decision 0003 apply unchanged: DynamoDB locking (deprecated by HashiCorp), a customer managed KMS key (a deliberate scale-down; the state holds no secrets by design, and is revisited if it ever must), creating the bucket by hand, a CloudFormation stack for it, and applying from an administrator session elsewhere.

**Reusing the organization's state bucket in `dcg-platform`.** One bucket for everything is fewer pieces, but it puts HEAT's state in an account HEAT's pipeline must not reach, and makes every HEAT apply a cross-account operation into the organization layer. The organization decided projects own their platform accounts (its decision 0008); state is the first thing they own.

**A literal account id with the repository kept private.** That is dcg-platform's rule, for a repository whose purpose is to manage accounts by id. HEAT is written to be publishable, and a variable costs one ignored file.

## Where it is described

`terraform/backend/README.md` for the bucket, the bootstrap and who applies it. `docs/architecture/overview.md`, "Environments".
