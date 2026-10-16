# 0016: One root directory per environment, shared local modules

- **Status:** Decided. Amended by 0018 on 2026-10-16: the per-issue sandbox stacks share one root parameterized by the issue number; permanent environments stay a directory each.
- **Date:** 2026-10-15

## Decision

Each Terraform stack that is applied per environment has one root directory per environment, `terraform/<stack>/<environment>`, and the resources live in modules under `terraform/modules/`. A root holds the backend block with its own state key written in, the providers, and one or more module calls with that environment's values as literals. The only values a root does not commit are AWS account ids and the budget alert address, which sit in an ignored `terraform.tfvars` beside it.

Applying an environment is entering its directory and running `terraform init`, `terraform plan` and `terraform apply`, with no flags that select anything. Adding an environment is adding a directory. The `backend` stack has one root already and is unchanged. The `bootstrap` stack was restructured this way with its resources moved into `terraform/modules/bootstrap` through `moved` blocks, so the state did not move; the `environment` stack starts in this shape.

## Considered and not chosen

**One configuration per stack with a committed variable file and a partial backend file per environment**, the shape #12 and #20 used: `terraform init -backend-config dev.s3.tfbackend` and `terraform plan -var-file dev.tfvars`. It worked, and it had two faults that only showed when a second environment was imagined. One directory remembers one backend, so switching environments needed `-reconfigure` on every init, and the alternative flag would have copied one environment's state under the other's key. And nothing tied the variable file to the backend file: `prod.tfvars` with `dev.s3.tfbackend` would plan prod's names against dev's state. The owner raised both while reviewing #20. A directory per environment has neither fault, at the cost of a few lines of wiring repeated per root.

**Terraform workspaces.** Rejected before this record and still: workspaces share one backend configuration and one set of credentials, and are not an isolation mechanism between accounts.

**Terragrunt**, which generates each root from one definition and would remove the repetition between roots. Each root repeats a backend block, two provider blocks and three variable declarations, because Terraform allows provider configurations only in a root and lets a root's values land only in the root's own variables. That is a dozen lines per environment and two environments; a second tool with its own version, syntax and failure modes is not worth that much repetition. The validation of the values is not repeated: it lives in the module, and the root checks only the platform account id, which the module never sees. Raised by the owner in the review of the restructuring; revisited if the number of roots grows.

**A separate repository of modules**, as BattleScript Online planned with `bso-tf-modules`. A module registry has to be versioned and pinned, which is overhead with one consumer; that repository stayed empty and BSO's modules live beside its roots. HEAT's modules are local paths until a second repository needs them.

**What was kept from BSO's layout**, which was reviewed for this decision: the root-per-environment directories and the modules beside them. What was not: a gitignored variable file holding the environment name, a gitignored lock file, account ids in module code, and the account-wide OIDC provider and deploy role created by the same state as the application resources. HEAT keeps the bootstrap stack separate from the environment stack, commits its lock files, and keeps ids out of committed files.

## Where it is described

`docs/architecture/overview.md`, "Environments". `terraform/bootstrap/README.md`. `terraform/modules/bootstrap`.
