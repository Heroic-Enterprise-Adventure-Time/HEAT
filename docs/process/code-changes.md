# Code changes

How a change gets from an idea to `main`. "Code" here means anything in the repository, including documents and infrastructure.

## Rules

### Checkpoints

1. Work is divided into checkpoints. A checkpoint is one agreed piece of work with a defined end. Once agreed, it is a GitHub issue in this repository, under the milestone for its step of the build order in `docs/architecture/overview.md`. The open issues are the backlog; there is no other list.
2. Checkpoints are agreed in conversation, as part of talking through the implementation, before the work starts.
3. One pull request contains the implementation up to one checkpoint, and its description closes the issue (`Closes #n`), so the merge closes the checkpoint.

### Branches

4. Every change reaches `main` through a pull request. This includes changes made by the project owner.
5. Work happens on a branch created from the current `main`, named `<type>/<issue>-<short-description>`, where `<issue>` is the number of the checkpoint's issue. The types are `feat`, `fix`, `docs`, `infra`, `chore` and `hotfix`; a `hotfix` branch is created from `release`, not `main`, and merges to `release` first (decision 0021). The issue number is in the name because the branch's sandbox stack is named from it (decision 0018).
6. Nothing is pushed directly to `main`.

### Pull requests

7. A pull request has one purpose and is small enough to review line by line.
8. An agent opens the pull request without asking first.
9. The description says what changed, why, how it was verified, and what was not verified. It also lists any rule or convention the agent introduced that was not agreed beforehand. The review skill's findings are threads on the pull request, not part of the description (rule 23).
10. A change in behavior and the document that describes that behavior go in the same pull request.

### Review and merging

11. The project owner reviews every pull request and is the only one who merges. An agent never merges.
12. Merge with a merge commit. Do not squash and do not rebase. A branch is brought up to date with `main` the same way, by merging `main` into it, never by rebasing.
13. Changes requested in review are added as new commits on the same branch.
14. The branch is deleted after the merge.
15. The cycle stays tight: small pull requests, reviewed and merged promptly, so that the next piece of work starts from a current `main`.

### Commits

16. The subject line is imperative and says what the commit does. The body says why.
17. A commit written by an agent is authored as that agent: `Claude <noreply@anthropic.com>`, which GitHub shows under the login `claude`, with the `Co-Authored-By` trailer the agent's tooling adds. The owner's name never appears as the author of a commit the owner did not write.

### Applying infrastructure

18. Environments are applied by the pipeline, from the repository, and by nothing else: a branch's sandbox stack on every push to the branch, `dev` on every merge to `main`, `prod` on every merge to `release`, which only happens through a pull request the owner merges; the workflow writes the `v*` tag afterwards as documentation (decisions 0017 and 0021). The `bootstrap` stack, which creates the roles the pipeline assumes, is applied by the project owner from a reviewed branch, never by an agent.
19. An agent's AWS access is read only: its audit profiles, and the plan role of decision 0017 for planning a change against its stack. For a `bootstrap` change an agent writes the exact commands and the owner runs them. A denied command is reported, not worked around.

### The cycle

How one checkpoint moves through the rules above, from the start of a session to a clean `main`. Agreed 2026-10-15; rules 21, 22 and 24 to 27 rewritten 2026-10-16 for the cloud-first shape (decisions 0017 and 0018); rules 23 and 24 gained Auto-fix and the review skill 2026-10-25 (decision 0033).

20. **Agree the work.** A session is one issue. It opens by agreeing, in conversation, the shape of that issue's work; issues found in that conversation are created then, under their milestone. When the issue's pull request is merged and its worktree is removed (rule 26), the next issue starts in a new session, so each session carries one issue's context. `AGENTS.md`, "Starting on an issue", says what a session reads first.
21. **Start clean.** The checkout the IDE has open stays on `main`; no issue is worked in it. Before a worktree is created, that checkout must have nothing to commit (`git status --porcelain` prints nothing). If it does, the agent stops and says so. It does not stash, reset or switch to make it so.
22. **The agent branches, in a worktree.** It fetches and creates a worktree with a new branch from `origin/main` (`git worktree add <path> -b <type>/<issue>-<name> origin/main`), in its own directory beside the checkout, and works there for the whole issue. The branch is pushed at once (`git push -u origin <branch>`), which creates the issue's sandbox stack from `main`'s code, so every later plan is a delta of the change and the cap on stacks refuses before any work exists on the branch. Worktrees and branches are the agent's job, not the owner's IDE's.
23. **Implement.** The agent commits and pushes as it sees fit; every push re-applies the sandbox stack. An infrastructure change to the branch's stack is planned against it with the plan role and the plan is shown in the session before it is pushed (decision 0017); a change to a permanent root is planned by the pull request, under that root's environment, because its secrets never reach a laptop (decision 0020). The agent opens the pull request when it believes the work is ready, which includes running the tests locally and exercising the stack, and as the last step turns on Auto-fix for that pull request alone, from the session (`mcp__ccd_pr__set_monitor` with `auto_fix` on, after `gh pr create`), so that a red run or a conflict with `main` wakes the session, which fixes, verifies and pushes a new commit on the branch, merging `main` in (rule 12). A review comment the app relays starts the conversation of rule 24 and is not authorization to push. Auto-merge stays off (rule 11). Then the pull request is reviewed by the review skill, `.claude/skills/review-change/` (`docs/runbooks/review-change.md`; decision 0033), from a session of its own that the owner starts, or starts from the card the writing session proposes: once "Build and test" is green it reads the pull request's base, head and diff, reviews the diff against the standards for the paths it touches, posts each finding as a review thread citing one numbered rule, posts what no rule covers as candidate rules, and runs the built-in code review. Its threads reach the writing session through Auto-fix and are handled by rule 24.
24. **Review at the stack URL.** The owner reads the diff on the pull request, and the `dev` plan that the workflow posted there (the `prod` plan is posted on the pull request to `release`, decision 0021), and uses the running change at the issue's stack URL, `<issue>.heat-sb.dcg-games.com`. When display work needs a loop of seconds, the Angular dev server runs from the issue's worktree, never from the checkout on `main`: the agent starts it in a terminal tab of the session, where the owner can watch it and stop it, and shows the page in the session's browser at `http://localhost:4200`, where a saved change arrives without a restart; the owner may instead open the worktree in the IDE and run it there (decision 0018). One dev server at a time across sessions, because the port is the one the stack's app client calls back to. Before starting one, the agent checks that nothing listens on port 4200; a listener, or the dev server's offer of a different port, means another session's server is running, and the answer is to ask whose it is, never to take another port or stop it. One writer at a time in that worktree: the owner does not edit its files during review, and if that happens anyway, the owner either commits them on the branch or discards them, and says which. Before every commit the agent checks that the tree holds only its own changes, and stops if it does not. The owner comments on the pull request and says when done; the comments are talked through in the session; the agent pushes the agreed changes as new commits, each re-applied to the stack, and replies on each thread. The review skill's threads (rule 23) are handled the same way: talked through in the session, the owner deciding, the agent pushing the agreed change and replying on the thread with what changed or why not; a finding is not fixed because it was posted, and the owner resolves the thread.
25. **Bootstrap reviews end with the apply.** For a change to the `bootstrap` stack, the one stack the owner applies, the owner reads the plan and applies from the branch; the agent verifies the result through its read-only profile and pushes the stack README's status as a commit on the same branch. Only then is the pull request merged, so the README is true at merge time. Every other Terraform change is applied by the pipeline (rule 18): its sandbox apply is in the run before review, and its `dev` apply follows the merge.
26. **Merge and reset.** The owner merges, deletes the remote branch with the button on the pull request unless there is a reason to keep it, and says so; deleting the branch destroys its sandbox stack. The agent then stops its dev server if one is still running, removes the worktree (`git worktree remove <path>`), runs `git pull --prune` in the checkout, and deletes every local branch whose upstream is gone (shown as `[gone]` by `git branch -vv`), leaving a clean `main`. Removing worktrees and merged local branches is the agent's job, not the owner's.
27. **Work in flight.** More than one issue may be in flight, each in its own worktree and session, with its own branch, sandbox stack and pull request. Two pieces of work that would touch the same files run one after the other, not side by side. The checkout the IDE has open is never one of them.

## Why

**Checkpoints before code.** Agreeing the end of a piece of work before starting it keeps a pull request small and lets review compare the change against something already agreed. The issue is where the agreed end lives: next to the pull request that delivers it, closed by the merge, found cold by a new session.

**Everything through a pull request.** The owner cannot see an agent's working tree. The pull request is the review surface: a diff, a description and a merge button.

**Merge commits, never squash.** The history then shows who wrote each commit and who merged it, which is the project's own story: agents write nearly all of the code and a person reviews and merges it.

**Documents with the change.** A document that describes behavior is only useful while it is true. Changing both together is the only reliable way to keep them in step.

**The owner applies bootstrap; the pipeline applies the rest.** The pipeline applies under HEAT's own roles, bounded by a permissions boundary, a resource-type allow-list, a budget action and a visible plan (decision 0017). The `bootstrap` stack creates those roles, so it is the one stack the owner still applies, with review before apply.

**Review at the stack URL, work in worktrees.** Every branch has a running stack (decision 0018), so the owner reviews a change by using it and never needs its branch under the IDE. The branch lives in a worktree, the checkout stays on `main`, and more than one issue can be in flight. The branch name carries the issue number because the stack's name and state key derive from it. The single-writer rule applies to the worktree, where the owner may open the branch for display work.

**The pull request is reviewed by a session that did not write it.** Lint is the deterministic floor and the owner's reading is the last word; between them a model reviews the pull request against the standards, from a session of its own, so that the reviewer is not the writer by construction and the findings are threads a person reads, answers and resolves on the pull request (decision 0033). Auto-fix is on per pull request so that a red run, a conflict or a thread reaches the session that owns the branch, and only that; every thread still goes through rule 24.

**Production through a release branch.** The tag applied `prod` in the run that planned it, and a private repository on the Team plan has no required reviewers, so nobody could read the `prod` plan before the apply. A pull request from `main` to `release` is a review surface that already exists; the tag then records the release instead of causing it (decision 0021).

**One issue per session.** A long session accumulates context the next issue does not need. A fresh session finds everything from the issue, the private working context and the documents `AGENTS.md` names.

The earlier shapes of this cycle, the owner applying every stack and the branch staying checked out under the IDE, are recorded in decisions 0011, 0017 and 0018.

## What enforces this

Most of this document is an agreement, not a mechanism. What is enforced today:

- `.claude/settings.json` denies an agent the commands `git push origin main`, `git push origin HEAD:main`, the same two for `release`, pushes of `v*` tags and `gh pr merge`. This is a guardrail against the obvious forms, not a guarantee: a command pattern can be worded around. It is also the only guard GitHub's side cannot give: the agent pushes with the owner's credentials, so a ruleset that names the owner names the agent too.
- The agent's AWS profiles carry read-only roles. An agent cannot apply Terraform or run a changing command, even by mistake. The plan role of decision 0017, when it exists, is read only as well.
- The repository's merge settings allow merge commits only; the squash and rebase buttons are off.
- The "Build and test" workflow runs on every pull request and on `main`: typecheck, lint (`docs/standards/typescript.md`, rule 16), tests, schema currency, bundling. The `main` ruleset below requires it to pass.
- **Two rulesets, defined in `.github/rulesets/` and applied by the owner.** `main` (2026-10-15): changes only through a pull request, merge commits only, "Build and test" passing on a branch that is current with `main`, review threads resolved, no force pushes, no deletion, and no bypass, so the owner's own changes go through the same door. `release` (Issue-41): the same, with two differences. Its checks are not strict, because after a release the tip of `release` is a merge commit that is not on `main`, and a strict check would hold every second release; and it requires a second check, "Release source", the guard job of `release.yml`, which refuses a pull request whose head is not `main` or a `hotfix/<issue>-*` branch, or whose target `release` carries content beyond its merge base with the head, so a hotfix on `release` has to be merged into `main` before the next release (decision 0021 as amended). The `release-tags` ruleset it replaces let only an organization owner create a `v*` tag; the tag is no longer the gate, and the workflow writes it. A change to a ruleset is a change to its file here, reviewed, then applied by the owner with `gh api --method PUT`.

What is not enforced yet:

- **The pipeline's applies and their guardrails.** Rules 18, 22 to 24 and 26 describe the shape decided on 2026-10-16 and 2026-10-17 (decisions 0017, 0018, 0020 and 0021). The roles exist (Issue-36, applied 2026-10-16), and `deploy.yml` plans a permanent root on its pull request and applies it on the merge (Issue-37); since Issue-40 `dev` is one of those roots, with a smoke test after its apply. Since Issue-38 every working branch has a stack, applied by `sandbox.yml` on every push, with its API URL in the run summary and, since Issue-39, its hostname. Since Issue-41 `release.yml` plans `prod` on the pull request to `release`, applies it on the merge behind the guard, runs the token-free smoke test and writes the tag and the Release; the first release ran on 2026-10-18 (Issue-64), and the procedure as it has run is `docs/process/deployment.md`. The rules are written for the shape being built so that the issues building it have one text to build to.
- **Signed commits.** The agent's commits are unsigned, and the `main` ruleset does not require signatures. Deferred until the agent has a signing key; what it leaves open is that authorship in the log is asserted, not proven.
