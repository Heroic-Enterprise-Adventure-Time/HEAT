# 0017: The pipeline applies Terraform, and Terraform owns the function code

- **Status:** Decided. Amended by 0019 on 2026-10-16: the boundary is an allow-list of services with explicit denies, not a deny-list; the sandbox GitHub environment is one per stack, `sandbox-<issue>`; and the managed policy named under "Facts checked" is for the person configuring budget actions, not for the service role.
- **Date:** 2026-10-16
- **Supersedes:** 0011, the "Two paths, never crossed" rule and the Lambda code path. 0011's prod gate (a `v*` tag only the owner creates) and its OIDC identity for workflows stay.
- **Amends:** 0008, the sentence "every HEAT stack runs from `heat-platform`": the state stays there, the identity that applies an environment does not.

## Decision

**One path.** Every environment of HEAT, a sandbox stack, `dev` or `prod`, is created and changed by `terraform apply` run by GitHub Actions. There is no deploy step beside it. Terraform owns the function code: the workflow bundles each function listed in `manifest.json` with the repository's bundler, zips the bundle, and the environment module passes the zip to `aws_lambda_function` as `filename` with `code_sha256` set to the zip's hash and `publish = true`, so every change of code or configuration produces a Lambda version. An `aws_lambda_alias` per function points the routes' alias at `aws_lambda_function.<name>.version`. Nothing is excluded with `lifecycle { ignore_changes }`. A change that needs a table, a permission, an environment variable and the code that reads them is one plan and one apply, and Terraform's picture of a function is the truth.

**What applies where.**

| Trigger | Environment | Account | GitHub environment |
| --- | --- | --- | --- |
| A push to a working branch | the branch's sandbox stack (decision 0018) | `heat-sandbox` | `sandbox` |
| A merge to `main` | `dev` | `heat-dev` | `dev`, restricted to the branch `main` |
| A `v*` tag, which only the owner may create | `prod` | `heat-prod` | `prod`, restricted to tags matching `v*` |

A pull request run plans `dev` and `prod` and posts the plans; it never applies. Apply jobs never cancel a running apply, because a cancelled apply can leave the state lock behind, and each environment is a concurrency group of one, so applies queue. A sandbox apply needs the checks of the same run to pass first, so a stack always holds a commit that typechecks and passes the tests.

**Roles.** In each workload account, two roles created by the `bootstrap` stack, both HEAT's own, both trusting GitHub's OIDC provider with a condition on the GitHub environment:

- **The plan role** is read only in the account and may read the environment's state object. The pull request's plan job uses it with `-lock=false`. The agent may assume it from its audit chain, so that an infrastructure change is planned against the stack and the plan shown in the session before it is pushed. Issue-36 defines the mechanism.
- **The apply role** is an administrator under a permissions boundary that denies the services that cost money while idle, among them EC2 instances and volumes, NAT gateways, load balancers, RDS, OpenSearch, Redshift, ElastiCache and MSK. The boundary's list lives in the bootstrap module. The role may read and write its environment's keys in the state bucket, granted by the bucket's policy in `heat-platform`.

`PlatformAdminRole`, the organization's role in each workload account, is no longer the path by which an environment is applied. It remains the path by which the owner applies the `bootstrap` stack, which is the one stack the owner still applies (`docs/process/code-changes.md`, rule 18), because it creates the roles the pipeline assumes. The narrow deploy role of Issue-12, which only updated function code, has no job left and is removed by Issue-36.

**Guardrails.**

1. The permissions boundary above. A branch that rewrites the workflow runs as the apply role and no wider.
2. A plan-time check fails the run when the plan contains any resource type outside an allow-list committed in the repository. Adding a resource type is a reviewed change to that list.
3. Each workload account's budget has a budget action that attaches a deny-all IAM policy to the apply role automatically when actual spend exceeds the limit. Lifting it is the owner's console step, after the cause is found.
4. The plan of every apply is written to the run summary, so what changed in an environment is readable from the run without the log.
5. An infrastructure change is planned against its stack with the plan role and the plan is shown in the session before the change is pushed.

**Accepted and recorded.** A branch can rewrite the workflow file, and a push runs it with the sandbox apply role. Within the boundary it can damage sandbox stacks and, through a pull request to `main` that is merged, `dev`; an apply from `main` recreates either. It cannot reach `prod`: the prod apply role trusts only a run under the `prod` GitHub environment, that environment accepts only `v*` tags, and the `release-tags` ruleset lets only the owner create one. Accepted for a repository with one human collaborator and an agent that pushes as that human.

**Rollback** is moving the alias back to the previous version: a variable on the root, changed in a pull request and applied through the same pipeline. In an emergency the owner moves it with one CLI call and the next apply puts Terraform back in agreement.

**What this needs from the zip.** The plan job must bundle too, otherwise the plan cannot see a code change: one job bundles, uploads the zips as a workflow artifact, and the plan and apply jobs download them. The zip must be deterministic, or every apply publishes a needless version. esbuild is deterministic for the same inputs and lock file; whether `archive_file` fixes the entries' timestamps is verified by the first environment checkpoint (Issue-38), and if it does not, the workflow zips with a fixed timestamp.

## Considered and not chosen

**The split of 0011**: code through `update-function-code` behind an alias, Terraform ignoring the code hash, infrastructure applied by the owner. It existed for one reason, that the owner applied by hand and every code change must not cost the owner's time. Once the pipeline applies, that reason is gone and the split's costs remain: two paths that have to be ordered ("infrastructure first"), a function whose code Terraform does not know, and a deploy role beside the apply role.

**The pipeline assuming `PlatformAdminRole`** through a platform pipeline role in `heat-platform`, the shape first proposed on 2026-10-16. It is the organization's unbounded administrator role, its trust would have to be widened in the `dcg-platform` repository for the pipeline, and no permissions boundary could be put on it from here. A role HEAT creates can be bounded, and HEAT can change it.

**The owner continuing to apply environments**, with the pipeline deploying code only. The shape being left, kept while the owner's apply was the only control between review and an account; the guardrails above are what replaces it.

**The agent applying from the laptop.** The agent's AWS access is read only (`docs/process/code-changes.md`, rule 19) and stays so. The pipeline applying from a reviewed commit, with the plan visible, is a better record than any laptop.

## Facts checked

All read on 2026-10-16.

- **Terraform `aws_lambda_function`** (provider documentation): `filename` is the path to the deployment package; `source_code_hash` exists "to trigger updates when the local function source code changes" and out-of-band changes "will not be captured by this argument", while `code_sha256` is used "to trigger updates when the function source code changes" and does capture them; `publish` is "whether to publish creation/change as new Lambda Function Version", default `false`; `version` is the latest published version and `qualified_arn` the version's ARN when `publish` is true.
- **AWS Budgets actions** (Cost Management user guide, "Configuring budget actions" and "Configuring a budget action"): an action applies an IAM policy or a service control policy, or targets EC2 and RDS instances; it runs automatically or after manual approval; it needs an IAM role that Budgets assumes, for which AWS recommends its managed policy; it attaches to an actual or a forecasted threshold. Pricing: the first two action-enabled budgets are free, each further one $0.10 a day, so three accounts with one each cost about $3 a month.
- **GitHub OIDC** subjects and environment-scoped trust: as recorded in `terraform/bootstrap/README.md`, "Facts checked", on 2026-10-15; the deployment branch and tag policies on GitHub environments are confirmed when the environments are created in Issue-36.

## Where it is described

`docs/architecture/overview.md`, "Environments" and "Build order". `docs/process/code-changes.md`, rules 18, 24, 25 and 27. `terraform/bootstrap/README.md` and the workflow under `.github/workflows/` once Issue-36 and Issue-37 change them.
