# 0047: Every action runs at the commit a workflow lockfile records, and the composite actions are referenced as `$/`

- **Status:** Decided
- **Date:** 2026-11-08
- **Settles:** Issue-241, deferred by 0046: every `uses:` named a tag, and a tag moved upstream would run under the apply role with the environment's secrets.
- **Amends:** 0046, "Deferred: the actions are pinned by tag, not by commit".

## Decision

**A lockfile, not SHAs in the workflows.** `.github/workflows/actions.lock`, written by GitHub's `gh actions-lock` extension, records for every workflow each action it uses, the actions those actions use in turn, and for each one the commit, the full tag it came from and the ids of its owner and repository. The runner runs the recorded commit even if the tag moves, and refuses a commit no longer reachable from that tag or a repository whose ids have changed. The workflows keep readable tags, narrowed by the extension to full releases (`actions/checkout@v7.0.1`, not `@v7`), and the lockfile's diff is where a moved commit shows in review.

**The composite actions are referenced as `$/`.** The extension never follows a `./` action, because `./` runs whatever the workspace holds, and ours use remote actions of their own. `$/.github/actions/<name>` runs the action from this repository at the workflow's own commit, with no checkout, so the actions inside it are locked with the workflow. On `push`, `delete`, `schedule` and `workflow_dispatch` that is the commit `./` already ran. On `deploy.yml`'s and `release.yml`'s `pull_request_target` plans it is the base branch's, where `./` ran the pull request head's copy that the build had checked out: the plan's build now runs the same composite actions as the workflow around it, and a change to one is first exercised by the branch's own sandbox push, which runs the branch's copy.

**"Build and test" verifies the lockfile.** The `workflows` job downloads the extension's v0.4.1 `linux-amd64` binary, verifies its build attestation with `gh attestation verify --repo github/gh-actions-lock`, and runs it as `gh-actions-lock --verify` on its own, outside `gh`; `gh extension install --pin` takes only a tag for a binary extension, and a tag can move (`docs/process/best-practices.md`, rule 14, from the review of PR-244). The check writes nothing and fails on a workflow or `uses:` with no entry, or on a locked commit that no longer verifies upstream. The job holds no role and declares its own `permissions` (`docs/process/best-practices.md`, rule 13).

**The repository requires it.** After the merge, the owner turns on the repository's "Require lockfile" policy, so a workflow without a lockfile entry does not run. The policy also satisfies "Require actions to be pinned to a full-length commit SHA", which stays off.

**Dependabot keeps it current.** When Dependabot opens an update for an action in a locked workflow it regenerates the matching entry in the same pull request. A change to a `uses:` by hand is relocked with `gh actions-lock` and committed with the workflow.

**actionlint is told about `$/`.** actionlint 1.7.12, the latest release, does not know the syntax (rhysd/actionlint issue 711). `.github/actionlint.yaml` ignores that one message on the workflows, so every other check on a `uses:` still runs; it goes when a release that knows `$/` is pinned.

## Considered and not chosen

**Full commit SHAs in every `uses:`, with the tag as a comment, and the "require SHA pinning" setting.** The issue's first shape, and GitHub's advice for a repository that cannot adopt a lockfile. It locks only the actions named in our files, not the ones they use, and checks no repository identity. GitHub's secure-use guide now ranks it second.

**Keeping `./` with `--ignore-local-actions`.** The actions inside the composite actions would have no lockfile entry, and under the policy those steps fail when they are reached; the documented remedy is a never-run placeholder action listing them, a second copy to keep in step.

**A fork of actionlint that knows `$/`.** Swapping the linter's source is a decision of its own, and a narrow ignore keeps the pinned release and its attestation check.

## What it leaves open

- The lockfile proves which commit runs, not that the commit is safe. A locked dependency is reviewed when its entry changes, Dependabot's included.
- A lockfile change that moves a tag back to an older commit in its history is not detected by the extension; the narrowing to full tags and the review of the lockfile's diff stand in for it.
- The extension is GitHub's own code at v0.4.1, released 2026-11-02, and the verify job runs it on every push, with no role, after checking its attestation. A laptop installs it with `gh extension install --pin v0.4.1`, by tag.
- On a `pull_request_target` plan, a pull request that changes a composite action is planned with the base's copy of it, so the plan can differ from what the merge applies; the composite actions mostly call scripts from the checked-out head, which the plan does use. Raised by the review of PR-244 and kept: the way back is running the head's action code in that job.
- Whether Dependabot regenerates the lockfile when it updates an action inside a composite action, whose entries the lockfile records under the workflows that call it, is not documented; "Build and test" refuses such a pull request if it does not (Issue-245).
- Reusable workflows from other repositories are not locked; this repository calls none.

## Facts checked

- GitHub, "Secure use reference", read 2026-11-08: locking workflow dependencies with a lockfile is "the strongest protection available, and supersedes SHA pinning for repositories that adopt it"; pinning to a SHA is for repositories that cannot adopt one.
- GitHub changelog, 2026-10-28, "GitHub Actions workflow lockfiles are generally available", read 2026-11-08: on the Free and Team plans; Dependabot regenerates the matching entry in its own pull request; the "Require lockfile" policy is available to repository administrators.
- GitHub, "Workflow dependency lockfiles" and "Lock workflow dependencies", read 2026-11-08: the recorded commit must be reachable from the recorded tag, `owner_id` and `repo_id` confirm the repository, a lockfile satisfies the require-SHA policy, `./` actions are never followed and `--migrate-local-actions` is the recommended fix.
- GitHub changelog, 2026-07-30, "Reference same-repository actions with self-repository syntax", read 2026-11-08: `$/` resolves to the workflow's repository at the commit that is running, with no checkout, wherever `./` works, on runner 2.336.0 or newer.
- `github/gh-actions-lock` v0.4.1, run 2026-11-08 in the Issue-241 worktree: `--no-fix` reported the three composite actions as blocking errors and every action unpinned; `--migrate-local-actions` rewrote ten references to `$/`, pinned eight actions across five workflows, and `--verify` then reported all five valid.
- The extension's v0.4.1 release, checked 2026-11-08: its `linux-amd64` and `windows-amd64.exe` binaries have build attestations that `gh attestation verify --repo github/gh-actions-lock` accepts, and the Windows binary, run on its own with `GH_TOKEN` set, reported all five workflows valid. `gh extension install --help`: `--pin` is "a tag or commit for binary and script extensions respectively".
- The repository's Actions permissions, read 2026-11-08 through the API: all actions allowed, `sha_pinning_required` false.

## Where it is described

`.github/workflows/actions.lock`; `.github/workflows/ci.yml`, the `workflows` job; `.github/actionlint.yaml`; `.github/dependabot.yml`; `docs/process/best-practices.md`, rule 13; `docs/process/development.md`, rule 2.
