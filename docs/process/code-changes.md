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

7. A pull request has one purpose and is small enough to review line by line. What its work or its review finds on the way is done in it, by rule 30.
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

18. Environments are applied by the pipeline, from the repository, and by nothing else: a branch's sandbox stack on every push to the branch, `dev` on every merge to `main`, `prod` on every merge to `release`, which only happens through a pull request the owner merges; the workflow writes the `v*` tag afterwards as documentation (decisions 0017 and 0021). The `bootstrap` stack, which creates the roles the pipeline assumes, and the `backend` stack, which holds every stack's state, are applied by the project owner from a reviewed branch, never by an agent.
19. An agent's AWS access is read only: its audit profiles, and the plan role of decision 0017 for planning a change against its stack. For a `bootstrap` or a `backend` change an agent writes the exact commands and the owner runs them. A denied command is reported, not worked around.

### The cycle

How one checkpoint moves through the rules above, from the start of a session to a clean `main`.

20. **Agree the work.** A session is one issue. It opens by agreeing, in conversation, the shape of that issue's work; issues found in that conversation are created then, under their milestone. When the issue's pull request is merged and its worktree is removed (rule 26), the next issue starts in a new session, so each session carries one issue's context. `AGENTS.md`, "Starting on an issue", says what a session reads first. A session that stops with its issue unfinished leaves where the work stands as a comment on the issue, or in the pull request's description once there is one; the next session reads it there, and no state of the work is kept in a private file (Issue-318).
21. **Start clean.** The checkout the IDE has open stays on `main`; no issue is worked in it. Before a worktree is created, that checkout must have nothing to commit (`git status --porcelain` prints nothing). If it does, the agent stops and says so. It does not stash, reset or switch to make it so.
22. **The agent branches, in a worktree.** It fetches and creates a worktree with a new branch from `origin/main` (`git worktree add <path> -b <type>/<issue>-<name> origin/main`), in its own directory beside the checkout, and works there for the whole issue. The branch is pushed at once (`git push -u origin <branch>`), which creates the issue's sandbox stack from `main`'s code, so every later plan is a delta of the change and the cap on stacks refuses before any work exists on the branch. Worktrees and branches are the agent's job, not the owner's IDE's.
23. **Implement.** The agent commits and pushes as it sees fit; every push re-applies the sandbox stack. An infrastructure change to the branch's stack is planned against it with the plan role and the plan is shown in the session before it is pushed (decision 0017); a change to a permanent root is planned by the pull request, under that root's environment, because its secrets never reach a laptop (decision 0020). The agent opens the pull request when it believes the work is ready, which includes running the tests locally and exercising the stack, and as the last step turns on Auto-fix for that pull request alone, from the session (`mcp__ccd_pr__set_monitor` with `auto_fix` on, after `gh pr create`), so that a red run or a conflict with `main` wakes the session, which fixes, verifies and pushes a new commit on the branch, merging `main` in (rule 12). A review comment the app relays starts the conversation of rule 24 and is not authorization to push. Auto-merge stays off (rule 11). Then the pull request is reviewed against the standards by the review skill, from a session of its own that the owner starts, or starts from the card the writing session proposes, following `docs/runbooks/review-change.md` (decision 0033); its findings are review threads, which reach the writing session through Auto-fix and are handled by rule 24.
24. **Review at the stack URL.** The owner reads the diff on the pull request, and the `dev` plan that the workflow posted there (the `prod` plan is posted on the pull request to `release`, decision 0021), and uses the running change at the issue's stack URL, `<issue>.heat-sb.dcg-games.com`. When display work needs a loop of seconds, the Angular dev server runs from the issue's worktree, never from the checkout on `main`, by `docs/runbooks/dev-server.md`: in a terminal tab of the session, where the owner can watch it and stop it, with the page in the session's browser, where a saved change arrives without a restart; the owner may instead open the worktree in the IDE and run it there (decision 0018). One dev server at a time across sessions, because the port is the one the stack's app client calls back to: a listener on port 4200, or the dev server's offer of a different port, means another session's server is running, and the answer is to ask whose it is, never to take another port or stop it. One writer at a time in that worktree: the owner does not edit its files during review, and if that happens anyway, the owner either commits them on the branch or discards them, and says which. Before every commit the agent checks that the tree holds only its own changes, and stops if it does not. The owner comments on the pull request and says when done; the comments are talked through in the session; the agent pushes the agreed changes as new commits, each re-applied to the stack, and replies on each thread. The review skill's threads (rule 23) are handled the same way: talked through in the session, the owner deciding, the agent pushing the agreed change and replying on the thread with what changed or why not; a finding is not fixed because it was posted, and the owner resolves the thread.
25. **Bootstrap and backend reviews end with the apply.** For a change to the `bootstrap` stack or to the `backend` stack, the two the owner applies (`terraform/backend/README.md`, "Who applies it"; the backend written here since Issue-270), the owner reads the plan and applies from the branch; the agent verifies the result through its read-only profile and pushes the stack README's status as a commit on the same branch. Only then is the pull request merged, so the README is true at merge time. Every other Terraform change is applied by the pipeline (rule 18): its sandbox apply is in the run before review, and its `dev` apply follows the merge.
26. **Merge and reset.** The owner merges, deletes the remote branch with the button on the pull request unless there is a reason to keep it, and says so; deleting the branch destroys its sandbox stack. The agent then stops its dev server if one is still running, removes the worktree (`git worktree remove <path>`), runs `git pull --prune` in the checkout, and deletes every local branch whose upstream is gone (shown as `[gone]` by `git branch -vv`), leaving a clean `main`. Removing worktrees and merged local branches is the agent's job, not the owner's. Which session does it is `docs/process/sessions.md`, rule 17.
27. **Work in flight.** More than one issue may be in flight, each in its own worktree and session, with its own branch, sandbox stack and pull request. Two pieces of work that would touch the same files run one after the other, not side by side. The checkout the IDE has open is never one of them.
28. **The checkup at a pause, and its triage.** At a pause, a checkpoint merged or a step of the build order begun, the whole tree on `main` is reviewed against the standards by the checkup skill, from a session of its own that follows `docs/runbooks/checkup.md`, and each finding is an issue labeled `finding`, citing one numbered rule, filed as a sub-issue of a batch issue, one batch per pull request that would fix its findings, under that batch's milestone (decisions 0033, 0034 and 0049). The owner triages on GitHub: an open batch is a checkpoint worked like any other (rule 1), and its pull request closes the batch and each finding under it; a `finding` closed with the label `excused` and a one-line comment giving the reason is excused and the checkup does not raise it again, the closed issue being the record; closed without that label, it was fixed. A batch whose findings are all excused is closed with them, its comment naming them, and the rest of its body is dropped. An excuse that is a standing decision goes under "Held back" in the detail file of the standard whose rule it excuses, or into a decision record, in a pull request of its own. (Issue-147; in batches since Issue-273.)

### Merge gates

29. **Every job that gates a merge is a required check of both rulesets, by its job's name.** A required check is a check run's name, not a workflow's, so a gate the rulesets do not name can be red and the pull request still merge, as the Terraform and workflow checks could until Issue-267. A new gate job and its entries in `.github/rulesets/` go in the same pull request, and the owner applies them before its merge. Not gates: the plan jobs, which are what the owner reads, and which the apply plans and checks again; and the sandbox stack's jobs, because a Dependabot pull request has no stack and the cap can refuse one, so a required stack check would never report and would hold the pull request for good, while rule 23 already has the writer exercise the stack before opening it. (Issue-257.)

### Found on the way

30. **What a checkpoint's work or its review finds is done in that checkpoint, not filed for later.** A fix, a document that has outgrown its rule, or a change of direction the owner decides while the pull request is open goes into that pull request as commits of its own: done now, written down where the behavior or the decision is described, and the context brought up to date in the same push, the issue's body, the build order and the pull request's description, so that nothing still describes the old direction. An issue is filed only for work that cannot ride: it needs a design conversation of its own, it would touch files that another issue in flight is changing (rule 27), or the owner judges that it would make the pull request too large to read. (Issue-282.)

## Why

**Checkpoints before code.** Agreeing the end of a piece of work before starting it keeps a pull request small and lets review compare the change against something already agreed. The issue is where the agreed end lives: next to the pull request that delivers it, closed by the merge, found cold by a new session.

**Everything through a pull request.** The owner cannot see an agent's working tree. The pull request is the review surface: a diff, a description and a merge button.

**Merge commits, never squash.** The history then shows who wrote each commit and who merged it, which is the project's own story: agents write nearly all of the code and a person reviews and merges it.

**Documents with the change.** A document that describes behavior is only useful while it is true. Changing both together is the only reliable way to keep them in step.

**The owner applies bootstrap and the backend; the pipeline applies the rest.** The pipeline applies under HEAT's own roles, bounded by a permissions boundary, a resource-type allow-list, a budget action and a visible plan (decision 0017). The `bootstrap` stack creates those roles and the `backend` stack holds the state they write, so those two are what the owner still applies, with review before apply.

**Review at the stack URL, work in worktrees.** Every branch has a running stack (decision 0018), so the owner reviews a change by using it and never needs its branch under the IDE. The branch lives in a worktree, the checkout stays on `main`, and more than one issue can be in flight. The branch name carries the issue number because the stack's name and state key derive from it. The single-writer rule applies to the worktree, where the owner may open the branch for display work.

**The pull request is reviewed by a session that did not write it.** Lint is the deterministic floor and the owner's reading is the last word; between them a model reviews the pull request against the standards, from a session of its own, so that the reviewer is not the writer by construction and the findings are threads a person reads, answers and resolves on the pull request (decision 0033). Auto-fix is on per pull request so that a red run, a conflict or a thread reaches the session that owns the branch, and only that; every thread still goes through rule 24.

**Production through a release branch.** A pull request from `main` to `release` is a review surface that already exists, where the `prod` plan is read before the apply; the tag records the release and does not cause it (decision 0021).

**One issue per session.** A long session accumulates context the next issue does not need, and every call reads all of it again (`docs/process/sessions.md`, rule 16). A fresh session finds everything from the issue, its comments and the documents `AGENTS.md` names (Issue-318).

**Done where it is found.** Every issue filed for later is a session to start, a context to read cold and a pull request to review. One purpose still bounds what a pull request sets out to do; it does not send what the work turns up to the backlog (Issue-282).

The dated account of each rule, and the earlier shapes of the cycle, are `docs/process/history.md`.

## What enforces this

Most of this document is an agreement, not a mechanism. What a mechanism holds, the denied commands and the hooks of `.claude/settings.json`, the agent's read-only roles, the merge settings, "Build and test" and the two rulesets, and what none holds yet, is `docs/process/enforcement.md`.
