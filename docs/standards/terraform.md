# Terraform

Standards for every stack under `terraform/`: `backend`, `bootstrap` and `environment`, their roots and the modules they compose. The design is `docs/architecture/overview.md`, "Environments", and decisions 0008 and 0016 to 0021; this document says how a stack is written so that the next one reads like the last. Written on 2026-10-24 (Issue-145) from the roots and modules on `main`. A convention tflint can express is in `terraform/.tflint.hcl`, not here (rule 17).

## Rules

### Layout

1. **One root per environment, resources in modules** (decision 0016). A root directory, `terraform/<stack>/<environment>`, holds its backend block with the state key written in, its providers, its variables, its outputs, and one or more module calls with that environment's values as literals; the resources live in `terraform/modules/<name>`. Applying is entering the directory with no flag selecting anything. The one exception is the per-issue sandbox root, `terraform/environment/sandbox`, which takes the issue number as a variable and its state key from `scripts/sandbox.mjs`, because the key and the name derive from one number (decision 0018).
2. **A module takes values; it never finds them.** A module builds no ARN from an account id and reads no other stack's state; what it needs arrives as a variable, or the root that composes it finds it by name through a data source, as the sandbox root finds the base's pool, zone and certificate. A value that differs between environments is a literal in the root, with a comment saying why it differs, so the difference is read where it is set (`terraform/environment/prod/main.tf`).
3. **Files are named for what they hold.** A root has `backend.tf`, `providers.tf`, `variables.tf`, `outputs.tf`, `versions.tf` and `main.tf` for its module calls; a module has one file per concern, `tables.tf`, `functions.tf`, `api.tf`, `sign_in.tf`, `alarms.tf`, with `variables.tf`, `outputs.tf` and `versions.tf`.

### What never enters git

4. **No account id and no secret in a committed file** (docs/README.md, rule 9; decision 0020). An account id is a variable validated as twelve digits, from a GitHub variable in the pipeline and from the private script or an ignored `terraform.tfvars` on a laptop, and the provider's `allowed_account_ids` refuses any other account before anything is planned. A secret is `sensitive = true`, lives in the GitHub environment of the deployment it belongs to, enters AWS through a base root, and is never given to an environment root. State holds a secret only where the resource needs the raw value, which decision 0020 names.
5. **Every variable has a description, a type and, where its shape is known, a validation;** every output a description where its name does not say enough (tflint, `terraform_documented_variables`, `terraform_typed_variables`). The description says what the value is and where it comes from, in the pipeline and on a laptop.

### Naming and tags

6. **One prefix per environment:** `heat-sb<issue>`, `heat-dev`, `heat-prod`, and `<prefix>-base` for a base. Every named resource is `<prefix>-<what>`: `heat-dev-player`, `heat-dev-hub`, `heat-dev-client`, `heat-dev-alarms`. The prefix is what the bootstrap boundary allows IAM writes under and what the plan role's log permission is keyed on, and it reads as one environment in the console, in CloudTrail and on the bill (decisions 0019 and 0023). Parameters live under `/heat/<prefix>/`; a log group is named where its service writes by default.
7. **Tags through the provider's `default_tags`,** set once in the root: `Project`, `Environment`, `Stack`, `ManagedBy`. No resource tags itself.

### The guardrails

8. **A new resource type is a line in `terraform/allowed-resource-types.txt`,** added by the pull request that introduces the resource, under a comment saying what uses it (decision 0017, guardrail 2). The plan-time check fails the run on anything else, a delete excepted.
9. **A new service is a bootstrap change.** The boundary's allow-list names the services the shape uses; a service outside it is a change to `terraform/modules/bootstrap/boundary.tf`, planned on the branch and applied by the owner before the environment change that needs it (decision 0019; `terraform/bootstrap/README.md`). Nothing on the boundary's deny list is ever asked for.
10. **Every role carries the boundary and the least it needs.** `permissions_boundary` on every role; an inline policy that names the actions the code makes and the resources it makes them on, the function's own log group, the two tables, the bucket's objects; `resources = ["*"]` only where the service has no resource, as X-Ray's writes have none, with the reason in a comment.
11. **Nothing is excluded from the plan.** No `lifecycle { ignore_changes }` (decision 0017). `prevent_destroy` on what holds records or names that cannot be remade, the pool, the zone, the certificate; deletion protection and point-in-time recovery as the environment's literals; a `moved` block where state is reorganized, kept afterwards as history.
12. **Nothing costs money at rest.** On-demand tables, no provisioned concurrency, no VPC, pay-as-you-go distributions, buckets without versioning where the objects are a build. A resource that would cost while idle is a decision record before it is a plan (best-practices, rule 5).

### Versions and state

13. **Pinned and locked.** `required_version` is the floor the code needs; the provider is pinned to a minor, `~> 6.68`; `.terraform.lock.hcl` is committed in every root for Windows and Linux (`terraform providers lock -platform=windows_amd64 -platform=linux_amd64`), and Dependabot tracks every root (`.github/dependabot.yml`). The pipeline runs the latest Terraform release and the owner's machine tracks it (typescript.md, rule 1). A provider behavior the code relies on is read in the documentation and recorded with its date, in the file's comment or under "Facts checked" in the module's README or the decision record.
14. **State in the one bucket,** one key per stack and environment, `use_lockfile`, encrypted (decision 0008): the key written in the root's backend block, or supplied by the script for the sandbox root. Never Terraform workspaces, which share one backend and are no isolation between accounts (decision 0016).

### Comments and documents

15. **Every file opens with why.** A comment at the top of each `.tf` file says what the file creates, which decision it comes from and what was deliberately left out; an argument whose value is not obvious has its reason beside it; a fact read from documentation names the page and the date it was read. A stack's README says what the stack manages, whether and when it was applied, how it is planned on a laptop and verified, and its lock-file command; its status line changes in the pull request that changes what it says (code-changes, rule 25).
16. **A decision record first** for a new service, a resource type that costs at rest, a change to a guardrail, a scale-down of a documented practice, or a change of layout (best-practices, rules 5 and 6). The stack's README names the record.

### Changes

17. **The Terraform floor is `fmt`, `validate`, tflint and the allow-list check.** "Build and test" runs `terraform fmt -check -recursive`, `init -backend=false` and `validate` in every root, and tflint over every root and module from `terraform/` with the `terraform` ruleset's recommended preset and the AWS ruleset, pinned in `terraform/.tflint.hcl`; every pull request's and apply's plan runs `scripts/check-plan-resource-types.mjs`. A finding is fixed before review. A finding that is deliberate carries a `tflint-ignore` annotation with its reason on the line above it, as the bootstrap roots' unused caller-identity data source does, which exists to force the account check. A rule tflint can express is not written here.
18. **Plan before pushing** an infrastructure change, through the plan role, from the worktree with the bundle built, and show the plan in the session (decision 0017, guardrail 5; development.md, rule 6); a permanent root's plan with real values is the pull request's. The pull request description says the plan's line, `Plan: 1 to add, 0 to change, 0 to destroy`, and what verified the change after the apply.

## Held back

- **A security scanner** beside the linter, trivy's misconfiguration checks on every root: Issue-157. Until then the boundary, the bucket policies and the pool's settings are checked by review and by the plan-time allow-list alone.

## Why

The layout rules are decision 0016's and 0018's reasons restated as what to write: one directory remembers one backend, so a flag that selects an environment is a flag that can select the wrong one, and a module that found its own values would hide which root chose them. The naming and tag rules come from the guardrails: the boundary and the plan role are keyed on the prefix (decision 0019), so a resource outside it is one the pipeline cannot create and one the agent cannot read the logs of.

The guardrail rules are decision 0017's five guardrails as they fall on the person writing a change: the allow-list file and the boundary are where a new resource and a new service are reviewed, and the least-privilege policy is what keeps a function's role from being the apply role's twin. Nothing at rest is the serverless shape's own test (decisions 0012 and 0013): a stack that costs nothing while idle can exist per issue.

The floor gained tflint on 2026-10-24 (Issue-145), when the owner weighted accepted practice over the code as it was: `fmt` and `validate` are syntax, and tflint is the published linter for what syntax cannot see. Its first run found four things of two kinds, an unused variable the environment module declared and three roots passed, removed, and an unused data source that exists on purpose, annotated. The linter is the floor and this document starts above it, as lint and `typescript.md` do.
