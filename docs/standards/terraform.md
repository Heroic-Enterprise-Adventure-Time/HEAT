# Terraform

Standards for every stack under `terraform/`: `backend`, `bootstrap` and `environment`, their roots and the modules they compose. The design is `docs/architecture/overview.md`, "Environments", and decisions 0008 and 0016 to 0021; this document says how a stack is written so that the next one reads like the last (Issue-145). A convention tflint can express is in `terraform/.tflint.hcl`, not here (rule 17). The detail of a rule, the whole of one written here as a single line, what this document holds back and why its rules are as they are, is `docs/standards/terraform-detail.md`, which nothing loads; its opening says when each section is read (decision 0060).

## Rules

### Layout

1. **One root per environment, resources in modules** (decision 0016). A root directory, `terraform/<stack>/<environment>`, holds its backend block with the state key written in, its providers, its variables, its outputs, and one or more module calls with that environment's values as literals; the resources live in `terraform/modules/<name>`. Applying is entering the directory with no flag selecting anything. Two exceptions: the per-issue sandbox root, `terraform/environment/sandbox`, which takes the issue number as a variable and its state key from `scripts/sandbox.mjs`, because the key and the name derive from one number (decision 0018); and the backend stack, `terraform/backend`, whose resources are in its root, because it has one instance and no environment for a module to be shared between (Issue-270).
2. **A module takes values; it never finds them.** A module builds no ARN from an account id and reads no other stack's state; what it needs arrives as a variable, or the root that composes it finds it by name through a data source, as the sandbox root finds the base's pool, zone and certificate. A value that differs between environments is a literal in the root, with a comment saying why it differs, so the difference is read where it is set (`terraform/environment/prod/main.tf`). The exception is the bootstrap module, which its root gives the account ids and which builds from them the ARNs its policies name: its own guardrails, the patterns under its prefix and the management account's audit role. The boundary cannot reference itself or the role that carries it, and a pattern is no resource's ARN, so all of them are written one way, from the module's own names (Issue-270).
3. **Files are named for what they hold.** A root has `backend.tf`, `providers.tf`, `variables.tf`, `outputs.tf`, `versions.tf` and `main.tf` for its module calls; a module has one file per concern, `tables.tf`, `functions.tf`, `api.tf`, `sign_in.tf`, `alarms.tf`, with `variables.tf`, `outputs.tf` and `versions.tf`.

### What never enters git

4. **No account id and no secret in a committed file** (docs/README.md, rule 9; decision 0020). An account id is a variable validated as twelve digits, from a repository secret in the pipeline (decision 0035) and from the private script or an ignored `terraform.tfvars` on a laptop, and the provider's `allowed_account_ids` refuses any other account before anything is planned. A secret is `sensitive = true`, lives in the GitHub environment of the deployment it belongs to, enters AWS through a base root, and is never given to an environment root. State holds a secret only where the resource needs the raw value, which decision 0020 names.
5. **Every variable has a description, a type and, where its shape is known, a validation,** which tflint holds but for the validation; the description says what the value is and where it comes from: the companion's "Rule 5".

### Naming and tags

6. **One prefix per environment:** `heat-sb<issue>`, `heat-dev`, `heat-prod`, and `<prefix>-base` for a base. Every named resource is `<prefix>-<what>`: `heat-dev-player`, `heat-dev-hub`; a name scoped inside a prefixed parent, an app client in the pool, an authorizer in the API, an inline policy on a role, need not carry it (Issue-270). The prefix is what the bootstrap boundary allows IAM writes under and what the plan role's log permission is keyed on, and it reads as one environment in the console, in CloudTrail and on the bill (decisions 0019 and 0023). Parameters live under `/heat/<prefix>/`; a log group is named where its service writes by default.
7. **Tags through the provider's `default_tags`,** set once in the root: `Project`, `Environment`, `Stack`, `ManagedBy`. No resource tags itself.

### The guardrails

8. **A new resource type is a line in `terraform/allowed-resource-types.txt`,** under a comment saying what uses it, in the pull request that introduces it; the plan-time check fails the run on anything else (decision 0017, guardrail 2).
9. **A new service is a bootstrap change.** The boundary's allow-list names the services the shape uses; a service outside it is a change to `terraform/modules/bootstrap/boundary.tf`, planned on the branch and applied by the owner before the environment change that needs it (decision 0019; `terraform/bootstrap/README.md`). Nothing on the boundary's deny list is ever asked for.
10. **Every role carries the boundary and the least it needs.** `permissions_boundary` on the apply role and on every role an environment creates; the bootstrap stack's other two roles, the plan role and the budget's action role, are guardrails themselves and carry none, since under it the budget's role could not freeze the apply role (Issue-270). An inline policy that names the actions the code makes and the resources it makes them on, the function's own log group, the two tables, the bucket's objects; `resources = ["*"]` only where the service has no resource, as X-Ray's writes have none, with the reason in a comment.
11. **Nothing is excluded from the plan.** No `lifecycle { ignore_changes }` (decision 0017). `prevent_destroy` on what holds records or names that cannot be remade, the pool, the zone, the certificate and the Terraform state bucket; deletion protection and point-in-time recovery as the environment's literals; a `moved` block where state is reorganized, kept afterwards as history.
12. **Nothing costs money at rest.** On-demand tables, no provisioned concurrency, no VPC, pay-as-you-go distributions, buckets without versioning where the objects are a build. A resource that would cost while idle is a decision record before it is a plan (best-practices, rule 5).

### Versions and state

13. **Pinned and locked.** `required_version` is the floor the code needs; the provider is pinned to a minor, `~> 6.68`; `.terraform.lock.hcl` is committed in every root for Windows and Linux, and Dependabot tracks every root. The pipeline runs one exact Terraform release, pinned with its checksum in `.github/actions/terraform` (best-practices, rule 14; decision 0048), moved like Node's (typescript.md, rule 1). A provider behavior the code relies on is read in the documentation and recorded with its date, in the file's comment or under "Facts checked" in the module's README or the decision record. The commands are the companion's "Rule 13".
14. **State in the one bucket,** one key per stack and environment, `use_lockfile`, encrypted (decision 0008): the key written in the root's backend block, or supplied by the script for the sandbox root. Never Terraform workspaces, which share one backend and are no isolation between accounts (decision 0016).

### Comments and documents

15. **Every file opens with why.** A comment at the top of each `.tf` file says what the file creates, which decision it comes from and what was deliberately left out; an argument whose value is not obvious has its reason beside it; a fact read from documentation names the page and the date it was read. A stack's README says what the stack manages, whether and when it was applied, how it is planned on a laptop and verified, and its lock-file command; its status line changes in the pull request that changes what it says (code-changes, rule 25).
16. **A decision record first** for a new service, a resource type that costs at rest, a change to a guardrail, a scale-down of a documented practice, or a change of layout (best-practices, rules 5 and 6). The stack's README names the record.

### Changes

17. **The Terraform floor is `fmt`, `validate`, tflint, trivy and the allow-list check,** which "Build and test" and every plan run, failing on a finding of any severity. A finding is fixed before review, or excused on the lines above it with its reason, and a rule tflint can express is not written here. What trivy does not see, a resource keyed by `for_each` on `manifest.json`, is checked by review and the allow-list alone. How each runs and how an excuse is written: the companion's "Rule 17" (Issue-145, Issue-157).
18. **Plan before pushing** an infrastructure change, through the plan role, from the worktree with the bundle built, and show the plan in the session (decision 0017, guardrail 5; development.md, rule 6); a permanent root's plan with real values is the pull request's. The pull request description says the plan's line, `Plan: 1 to add, 0 to change, 0 to destroy`, and what verified the change after the apply.

### Alarms

19. **A value the module sets on a function and an alarm then reads is one expression, not two literals,** because an alarm on a name nothing emits stays quiet under `treat_missing_data = "notBreaching"`. `local.service_names` is the function's `POWERTOOLS_SERVICE_NAME` and the conflict alarm's `service` dimension, so a rename fails the plan (the review of PR-209).

### Pins nothing tracks

20. **A pin that no Dependabot ecosystem tracks is checked by the checkup against the latest release,** as the Node and Terraform pins are (`docs/runbooks/checkup.md`, rule 12), and the checkup's report names the pin, the version it holds and the latest. A resource that carries such a pin says in its comment that nothing tracks it, as `otel_layer_arn` in `terraform/modules/environment/functions.tf` does, whose version releases the `@opentelemetry/api` hold in `docs/standards/typescript-detail.md`, "Held back" (the review of PR-331, Issue-326).
