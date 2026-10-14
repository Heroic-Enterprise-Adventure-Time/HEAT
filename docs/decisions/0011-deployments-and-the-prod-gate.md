# 0011: Deployments: code through the pipeline, infrastructure through Terraform, prod behind a tag

- **Status:** Decided
- **Date:** 2026-10-14

## Decision

**Two paths, never crossed.** A code change reaches an environment through GitHub Actions and never needs a Terraform apply. An infrastructure change, a new table, queue, function, route or parameter, reaches an environment through a reviewed Terraform change applied by the owner (`docs/process/code-changes.md`, rules 18 and 19) and never needs a code deploy. When both ship together, infrastructure goes first.

**Four code artifacts, one workflow.**

- **The hub image**, built on ARM, tagged with the commit, pushed to the registry in `heat-platform` and pulled across accounts by the workload accounts' execution roles. Terraform owns the service and its first task definition and ignores later task definitions; the workflow registers a new one and updates the service. (If the hub becomes a Lambda, it joins the next item.)
- **Lambda code**, bundled by the workflow and applied with `update-function-code` behind an alias that the triggers point at. Terraform owns each function's existence, role, triggers and alias and ignores the code hash.
- **The browser client**, built and synced to its bucket, with a CloudFront invalidation.
- **Database migrations**, run by the workflow before the hub is updated, failing the deploy if they fail.

**Environments and gates.** `dev` deploys on every merge to `main`. `prod` deploys on a version tag matching `v*`, and only the owner may create such tags, enforced by a repository ruleset. Pushing the tag is the approval.

**Identity for the pipeline.** Workflows assume roles through GitHub's OIDC provider: the platform deploy role in `heat-platform` for anything that touches state or the registry, and a narrow deploy role in each workload account whose trust names this repository and the GitHub environment. No long-lived credentials anywhere, which is also the organization's rule.

**Account ids and role ARNs** live in GitHub Actions repository variables, read by workflows as `vars.*` and by Terraform as `TF_VAR_*`. A person regenerates the ignored local variable file from them with one command. Nothing in a committed file names an account.

## Considered and not chosen

**Required reviewers on the `prod` environment.** The organization's decision 0008 describes it, and it is the better control. GitHub's reference (read 2026-10-14) says required reviewers and wait timers are only available for public repositories on the Free, Pro and Team plans; a private repository on Team gets the branches-and-tags rule only. This repository is private, so the tag is the gate. If the repository ever goes public, required reviewers are added and the tag stays.

**Terraform deploying code**, by taking image tags and code hashes as variables. Every code change then needs an apply by the owner, which is the one person's time the process exists to protect, and the pipeline would need to apply Terraform, which rule 18 forbids until it exists for that purpose.

**Deploying straight to prod on merge** with the environment as the only gate. Rejected with the original design: prod changes are stamped out deliberately, by version, which is also the showcase's point.

## Where it is described

`docs/architecture/overview.md`, "Environments". The workflows under `.github/workflows/` once they exist.
