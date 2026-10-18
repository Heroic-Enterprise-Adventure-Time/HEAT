# 0021: Production through a release branch; the tag is documentation; hotfixes from the start

- **Status:** Decided. Amended 2026-10-18 by Issue-41, which built the path. The `release` ruleset mirrors `main`'s except that its status checks are not strict: after a release, `release`'s tip is a merge commit that is not on `main`, so a strict check would hold every second release until `main` received it, and the only cure would be a push to `main` outside a pull request. In its place a guard job, `Release source`, which the ruleset requires, refuses a pull request whose head is not `main` or a `hotfix/<issue>-*` branch, or whose target `release` carries content beyond its merge base with the head, and runs again on the push before the apply (`scripts/check-release-source.sh`). The path is a workflow of its own, `.github/workflows/release.yml`, not rows in `deploy.yml`, because a matrix leg cannot be skipped per branch without recording a deployment under the wrong environment, and prod has the guard, the tag and the Release that nothing else has. Prod's pool has no password-flow client and no test users, so its smoke test is the token-free half of `scripts/e2e.mjs`. A back-merge of `release` into `main` after every release, which would have kept the checks strict, was considered on 2026-10-18 and not chosen: the push needs a bypass actor on `main` and a long-lived credential, a GitHub App's key, which are the two things the repository has been strictest about.
- **Date:** 2026-10-17
- **Amends:** 0011, the prod gate: a pull request merged to `release`, not a `v*` tag. 0017, the `prod` row of its table and "a pull request run plans `dev` and `prod`": `prod` applies on a merge to `release`, and its plan is on the pull request to `release`. 0018, "What is owed": the GitHub environment `prod` is restricted to branches, not tags.

## Decision

**A `release` branch.** `prod` is applied by the pipeline on every merge to `release`. A pull request from `main` to `release` is the release: its diff is what ships, and the workflow posts the `prod` plan on it, run under the `prod` environment through `pull_request_target` as 0020 describes. The owner reads the diff and the plan and merges; the merge applies. A `release` ruleset mirrors `main`'s: changes only through a pull request, merge commits only, "Build and test" passing, no force pushes, no deletion, no bypass.

**The tag is written afterwards.** After a successful apply the workflow tags the merge commit `v<YYYY>.<MM>.<DD>`, with `.<n>` appended for a second release on the same day, and creates a GitHub Release from the pull request. The tag records what was released; it triggers nothing. The `release-tags` ruleset, which let only an organization owner create `v*` tags, is replaced by the `release` ruleset, since the tag is no longer the gate and the workflow must be able to create it.

**Hotfixes from the start.** A branch `hotfix/<issue>-<name>` is created from `release`, carries only the fix, and is merged to `release` by the same pull request path, then to `main`. The branch type joins rule 5 of `docs/process/code-changes.md`. The details of the lifecycle, including how the fix reaches `main` and how the hotfix's sandbox stack is handled, are settled in their own issue when the first one is needed.

**The `prod` GitHub environment** admits the branches `main` and `release`: `release` for the apply, `main` because a `pull_request_target` run carries the default branch's ref. Only the default branch's workflow file ever runs under `prod` from a pull request, and only a merge to `release` applies.

**What enforces it.** GitHub cannot tell the agent from the owner: the agent pushes with the owner's credentials, so a ruleset that names the owner names the agent too. The merge of the release pull request is the owner's by rule 11, and the agent's deny list in `.claude/settings.json` gains pushes to `release` and `v*` tags beside pushes to `main`. This is the same enforcement the tag gate had.

**Why.** The tag applied `prod` in the same run that planned it, and a private repository on the Team plan has no required reviewers, so there was no place to read the `prod` plan before the apply. A plan posted on every pull request to `main` is stale by the time a tag is cut; a plan posted on every push to `main` has nowhere to live but a run summary. A pull request to `release` is a review surface that already exists, shows the exact diff that ships, and takes the plan as a comment like every other pull request.

## Considered and not chosen

**Keep the tag; plan on the tag, apply on a dispatch.** The tag push plans `prod` and stops; the owner reads the plan and dispatches the apply on the same tag ref. A manual gate without Enterprise's required reviewers, and the `prod` environment's `v*` policy covers both runs. Two runs per release, the plan in a run summary rather than on a diff, and the record of a release is a tag and two runs rather than a pull request.

**A `prod` plan on every push to `main`.** Always current, but attached to nothing a person reads, and it needs the `prod` plan role to trust a `main` push subject.

**Only the pull-request-time `prod` plan**, 0017's shape. Stale by the time a tag is cut, since other merges land in between.

**Disallowing hotfixes until needed.** The owner's reason for allowing them now: the moment they are disallowed, one will be needed with feature changes already on `main`.

## Facts checked

All read on 2026-10-17.

- **Deployment branch policies** (GitHub, "Deployments and environments"): matched against the run's `GITHUB_REF`; name patterns for branches and tags; no scoping by workflow file or job.
- **`pull_request_target`** (GitHub, "Events that trigger workflows"): runs in the context of the default branch of the base repository, `GITHUB_REF` the default branch.
- **Protection rules on private repositories** (GitHub, "Managing environments for deployment"; recorded earlier in 0011 and the dcg-platform handoff): required reviewers, wait timers and custom rules are not available to private repositories on the Team plan.
- **Not yet checked, on first use:** whether a workflow's token may create a `v*` tag under the rulesets in force; whether the `prod` policy accepts a `pull_request_target` run exactly as the documentation implies.

## Where it is described

`docs/architecture/overview.md`, "Environments". `docs/process/code-changes.md`, rules 5 and 18 and "What enforces this". `terraform/bootstrap/README.md`, "On the GitHub side". `.github/rulesets/` once the `release` ruleset exists.
