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
9. The description says what changed, why, how it was verified, and what was not verified. It also lists any rule or convention the agent introduced that was not agreed beforehand.
10. A change in behavior and the document that describes that behavior go in the same pull request.

### Review and merging

11. The project owner reviews every pull request and is the only one who merges. An agent never merges.
12. Merge with a merge commit. Do not squash and do not rebase.
13. Changes requested in review are added as new commits on the same branch.
14. The branch is deleted after the merge.
15. The cycle stays tight: small pull requests, reviewed and merged promptly, so that the next piece of work starts from a current `main`.

### Commits

16. The subject line is imperative and says what the commit does. The body says why.
17. A commit written by an agent is authored as that agent.

### Applying infrastructure

18. Environments are applied by the pipeline, from the repository, and by nothing else: a branch's sandbox stack on every push to the branch, `dev` on every merge to `main`, `prod` on every merge to `release`, which only happens through a pull request the owner merges; the workflow writes the `v*` tag afterwards as documentation (decisions 0017 and 0021). The `bootstrap` stack, which creates the roles the pipeline assumes, is applied by the project owner from a reviewed branch, never by an agent.
19. An agent's AWS access is read only: its audit profiles, and the plan role of decision 0017 for planning a change against its stack. For a `bootstrap` change an agent writes the exact commands and the owner runs them. A denied command is reported, not worked around.

### The cycle

How one checkpoint moves through the rules above, from the start of a session to a clean `main`. Agreed 2026-10-15; rules 21, 22 and 24 to 27 rewritten 2026-10-16 for the cloud-first shape (decisions 0017 and 0018).

20. **Agree the work.** A session is one issue. It opens by agreeing, in conversation, the shape of that issue's work; issues found in that conversation are created then, under their milestone. When the issue's pull request is merged and its worktree is removed (rule 26), the next issue starts in a new session, so each session carries one issue's context. `AGENTS.md`, "Starting on an issue", says what a session reads first.
21. **Start clean.** The checkout the IDE has open stays on `main`; no issue is worked in it. Before a worktree is created, that checkout must have nothing to commit (`git status --porcelain` prints nothing). If it does, the agent stops and says so. It does not stash, reset or switch to make it so.
22. **The agent branches, in a worktree.** It fetches and creates a worktree with a new branch from `origin/main` (`git worktree add <path> -b <type>/<issue>-<name> origin/main`), in its own directory beside the checkout, and works there for the whole issue. The branch is pushed as soon as it has a commit, which creates the issue's sandbox stack. Worktrees and branches are the agent's job, not the owner's IDE's.
23. **Implement.** The agent commits and pushes as it sees fit; every push re-applies the sandbox stack. An infrastructure change to the branch's stack is planned against it with the plan role and the plan is shown in the session before it is pushed (decision 0017); a change to a permanent root is planned by the pull request, under that root's environment, because its secrets never reach a laptop (decision 0020). The agent opens the pull request when it believes the work is ready, which includes running the tests locally and exercising the stack.
24. **Review at the stack URL.** The owner reads the diff on the pull request, and the `dev` plan that the workflow posted there (the `prod` plan is posted on the pull request to `release`, decision 0021), and uses the running change at the issue's stack URL, `<issue>.heat-sb.dcg-games.com`. When display work needs a loop of seconds, the owner opens the issue's worktree in the IDE and runs the Angular dev server there against the stack (decision 0018). One writer at a time in that worktree: the owner does not edit its files during review, and if that happens anyway, the owner either commits them on the branch or discards them, and says which. Before every commit the agent checks that the tree holds only its own changes, and stops if it does not. The owner comments on the pull request and says when done; the comments are talked through in the session; the agent pushes the agreed changes as new commits, each re-applied to the stack, and replies on each thread.
25. **Bootstrap reviews end with the apply.** For a change to the `bootstrap` stack, the one stack the owner applies, the owner reads the plan and applies from the branch; the agent verifies the result through its read-only profile and pushes the stack README's status as a commit on the same branch. Only then is the pull request merged, so the README is true at merge time. Every other Terraform change is applied by the pipeline (rule 18): its sandbox apply is in the run before review, and its `dev` apply follows the merge.
26. **Merge and reset.** The owner merges, deletes the remote branch with the button on the pull request unless there is a reason to keep it, and says so; deleting the branch destroys its sandbox stack. The agent then removes the worktree (`git worktree remove <path>`), runs `git pull --prune` in the checkout, and deletes every local branch whose upstream is gone (shown as `[gone]` by `git branch -vv`), leaving a clean `main`. Removing worktrees and merged local branches is the agent's job, not the owner's.
27. **Work in flight.** More than one issue may be in flight, each in its own worktree and session, with its own branch, sandbox stack and pull request. Two pieces of work that would touch the same files run one after the other, not side by side. The checkout the IDE has open is never one of them.

## Why

**Checkpoints before code.** Agreeing the end of a piece of work before starting it is what keeps a pull request small. It also means review compares the change against something already agreed, instead of discovering the scope in the diff. The issue is where the agreed end is written down, next to the pull request that delivers it and where a new session finds it cold; a list kept in a note goes stale silently, an issue is closed by the merge. Added 2026-10-15 when the first platform checkpoints were agreed.

**Everything through a pull request.** In a session that runs in the cloud, the project owner cannot see the agent's working tree. The pull request is the review surface: a diff, a description and a merge button.

**Merge commits, never squash.** The history then shows who wrote each commit and who merged it. Agents write nearly all of the code in this project and a person reviews and merges it; the commit log should say that without anyone having to explain it.

**Documents with the change.** A document that describes behavior is only useful while it is true. Changing both together is the only reliable way to keep them in step.

**The owner applies bootstrap; the pipeline applies the rest.** Until 2026-10-16 the owner applied every stack, because the Terraform ran as the organization's administrator role and review before apply was the only control between a mistake and a whole account. That shape made every code change wait for the owner's apply, or split code from infrastructure into two paths (decision 0011). Decision 0017 moves the apply into the pipeline, under HEAT's own roles bounded by a permissions boundary, a resource-type allow-list, a budget action and a visible plan, so that a change ships as one plan from a reviewed commit. The `bootstrap` stack creates those roles, so it is the one stack the owner still applies, with the same review-then-apply discipline; the `dcg-platform` repository, whose stack reaches every account in the organization, keeps the owner's apply for everything.

**The branch stays checked out** (2026-10-15 to 2026-10-16). The practice before that returned the checkout to `main` as soon as the pull request was open, which kept `main` under the IDE but meant the owner could not run the change without switching branches by hand. One checkout shared by a person and an agent is also one working tree, which is why the cycle names a single writer and makes the agent look before every commit. Serial work followed from the same fact: a second checkpoint would have needed the branch the first one was being reviewed on.

**Review at the stack URL, work in worktrees.** Once every branch has its own running stack (decision 0018), the owner reviews a change by using it at its URL and no longer needs its branch under the IDE. The branch therefore lives in a worktree, the checkout stays on `main`, and more than one issue can be in flight, each in its own worktree, session and stack. The single-writer rule moves to the worktree, where the owner may still open the branch for display work that needs a local dev server. The branch name carries the issue number because the stack's name and state key are derived from it, and a workflow run has nothing else to derive them from. Added 2026-10-16.

**Production through a release branch.** The tag applied `prod` in the same run that planned it, and a private repository on the Team plan has no required reviewers, so nobody could read the `prod` plan before the apply. A pull request from `main` to `release` is a review surface that already exists: its diff is what ships and the plan is a comment on it. The tag then records the release instead of causing it, and a hotfix is one more pull request to `release`. Added 2026-10-17 (decision 0021).

**One issue per session.** A long session accumulates context the next issue does not need and loses the thread of the one it has. Starting each issue in a new session keeps the context the issue's, and it only works if a fresh session can find everything from the issue itself, the private working context and the documents `AGENTS.md` names, which is what that section is for. Added 2026-10-16.

## What enforces this

Most of this document is an agreement, not a mechanism. What is enforced today:

- `.claude/settings.json` denies an agent the commands `git push origin main`, `git push origin HEAD:main`, the same two for `release`, pushes of `v*` tags and `gh pr merge`. This is a guardrail against the obvious forms, not a guarantee: a command pattern can be worded around. It is also the only guard GitHub's side cannot give: the agent pushes with the owner's credentials, so a ruleset that names the owner names the agent too.
- The agent's AWS profiles carry read-only roles. An agent cannot apply Terraform or run a changing command, even by mistake. The plan role of decision 0017, when it exists, is read only as well.
- The repository's merge settings allow merge commits only; the squash and rebase buttons are off.
- The "Build and test" workflow runs on every pull request and on `main`: typecheck, tests, schema currency, bundling. The `main` ruleset below requires it to pass.
- **Two rulesets, defined in `.github/rulesets/` and applied by the owner on 2026-10-15.** `main`: changes only through a pull request, merge commits only, "Build and test" passing on a branch that is current with `main`, review threads resolved, no force pushes, no deletion, and no bypass, so the owner's own changes go through the same door. `release-tags`: only an organization owner may create, move or delete a `v*` tag, which was the production gate of decision 0011; decision 0021 moves the gate to the `release` branch, so this ruleset is replaced by a `release` ruleset mirroring `main`'s when Issue-41 builds that path, and until then it stands. Verified by the agent after the apply: both read back as active with the rules the files define, and the first pull request under them was mergeable with the check green. GitHub added one field the file does not set, an extra approval for unattributed changes, which its documentation says has no effect when zero approvals are required. A change to a ruleset is a change to its file here, reviewed, then applied by the owner with `gh api --method PUT`.

What is not enforced yet:

- **The pipeline's applies and their guardrails.** Rules 18, 22 to 24 and 26 describe the shape decided on 2026-10-16 and 2026-10-17 (decisions 0017, 0018, 0020 and 0021). The roles exist (Issue-36, applied 2026-10-16). Until Issue-37 creates the workflow nothing applies an environment, until Issue-38 no sandbox stack exists and a branch has no stack URL to review at, and until Issue-41 there is no `release` branch. The rules are written for the shape being built so that the issues building it have one text to build to.
- **Signed commits.** The agent's commits are unsigned, and the `main` ruleset does not require signatures. Deferred until the agent has a signing key; what it leaves open is that authorship in the log is asserted, not proven.
