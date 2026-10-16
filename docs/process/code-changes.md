# Code changes

How a change gets from an idea to `main`. "Code" here means anything in the repository, including documents and infrastructure.

## Rules

### Checkpoints

1. Work is divided into checkpoints. A checkpoint is one agreed piece of work with a defined end. Once agreed, it is a GitHub issue in this repository, under the milestone for its step of the build order in `docs/architecture/overview.md`. The open issues are the backlog; there is no other list.
2. Checkpoints are agreed in conversation, as part of talking through the implementation, before the work starts.
3. One pull request contains the implementation up to one checkpoint, and its description closes the issue (`Closes #n`), so the merge closes the checkpoint.

### Branches

4. Every change reaches `main` through a pull request. This includes changes made by the project owner.
5. Work happens on a branch created from the current `main`, named `<type>/<short-description>`. The types are `feat`, `fix`, `docs`, `infra` and `chore`.
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

18. Terraform is applied by the project owner, from a reviewed branch, never by an agent. This holds until a pipeline exists, and the pipeline then applies only what has been merged to `main`.
19. An agent's AWS access is read only. An agent writes the exact commands for a change and the owner runs them. A denied command is reported, not worked around.

### The cycle

How one checkpoint moves through the rules above, from the start of a session to a clean `main`. Agreed 2026-10-15.

20. **Agree the work.** A session is one issue. It opens by agreeing, in conversation, the shape of that issue's work; issues found in that conversation are created then, under their milestone. When the issue's pull request is merged and the checkout is reset (rule 26), the next issue starts in a new session, so each session carries one issue's context. `AGENTS.md`, "Starting on an issue", says what a session reads first.
21. **Start clean.** Before a branch is created, the checkout must be on `main` with nothing to commit (`git status --porcelain` prints nothing). If it is not, the agent stops and says so. It does not stash, reset or switch to make it so.
22. **The agent branches.** It fetches, creates the branch from `origin/main` (`git switch -c <type>/<name> origin/main`) and stays on it. Branch switching is the agent's job, not the owner's IDE's.
23. **Implement.** The agent commits and pushes as it sees fit, and opens the pull request when it believes the work is ready, which includes running the tests locally.
24. **Review on the branch.** The branch stays checked out, so the owner can run the service from it while reading the diff. One writer at a time: the owner does not edit files in the checkout during review, and if that happens anyway, the owner either commits them on the branch or discards them, and says which. Before every commit the agent checks that the tree holds only its own changes, and stops if it does not. The owner comments on the pull request and says when done; the comments are talked through in the session; the agent pushes the agreed changes as new commits and replies on each thread.
25. **Infrastructure reviews end with the apply.** For a Terraform change the owner reads the plan and applies from the branch; the agent verifies the result through its read-only profile and pushes the stack README's status as a commit on the same branch. Only then is the pull request merged, so the README is true at merge time.
26. **Merge and reset.** The owner merges, deletes the remote branch with the button on the pull request unless there is a reason to keep it, and says so. The agent then runs `git switch main` and `git pull --prune`, and deletes every local branch whose upstream is gone (shown as `[gone]` by `git branch -vv`), leaving a clean `main`. Deleting merged local branches is the agent's job, not the owner's.
27. **One piece of work in flight.** Nothing new starts until the open pull request is merged. If two must ever run at once, the second gets a git worktree, so the checkout the IDE has open is not touched.

## Why

**Checkpoints before code.** Agreeing the end of a piece of work before starting it is what keeps a pull request small. It also means review compares the change against something already agreed, instead of discovering the scope in the diff. The issue is where the agreed end is written down, next to the pull request that delivers it and where a new session finds it cold; a list kept in a note goes stale silently, an issue is closed by the merge. Added 2026-10-15 when the first platform checkpoints were agreed.

**Everything through a pull request.** In a session that runs in the cloud, the project owner cannot see the agent's working tree. The pull request is the review surface: a diff, a description and a merge button.

**Merge commits, never squash.** The history then shows who wrote each commit and who merged it. Agents write nearly all of the code in this project and a person reviews and merges it; the commit log should say that without anyone having to explain it.

**Documents with the change.** A document that describes behavior is only useful while it is true. Changing both together is the only reliable way to keep them in step.

**The owner applies.** This project's Terraform runs with administrator access inside HEAT's AWS accounts, through a role the organization layer placed there. A mistake in an apply reaches a whole account. Review before apply is the control that exists today, so the apply stays with the person who reviewed. The same two rules hold in the `dcg-platform` repository, whose stack reaches every account in the organization.

**The branch stays checked out.** The earlier practice returned the checkout to `main` as soon as the pull request was open, which kept `main` under the IDE but meant the owner could not run the change without switching branches by hand. One checkout shared by a person and an agent is also one working tree, which is why the cycle names a single writer and makes the agent look before every commit. Serial work follows from the same fact: a second checkpoint would need the branch the first one is being reviewed on. Added 2026-10-15, before the first platform checkpoint.

**One issue per session.** A long session accumulates context the next issue does not need and loses the thread of the one it has. Starting each issue in a new session keeps the context the issue's, and it only works if a fresh session can find everything from the issue itself, the private working context and the documents `AGENTS.md` names, which is what that section is for. Added 2026-10-16.

## What enforces this

Most of this document is an agreement, not a mechanism. What is enforced today:

- `.claude/settings.json` denies an agent the commands `git push origin main`, `git push origin HEAD:main`, `gh pr merge`, and `serverless deploy` in its `sls` and `npx` forms, since the local emulator's framework can deploy and nothing of HEAT's is ever deployed by it (decision 0017). This is a guardrail against the obvious forms, not a guarantee: a command pattern can be worded around.
- The agent's AWS profiles carry read-only roles. An agent cannot apply Terraform or run a changing command, even by mistake.
- The repository's merge settings allow merge commits only; the squash and rebase buttons are off.
- The "Build and test" workflow runs on every pull request and on `main`: typecheck, tests, schema currency, bundling. The `main` ruleset below requires it to pass.
- **Two rulesets, defined in `.github/rulesets/` and applied by the owner on 2026-10-15.** `main`: changes only through a pull request, merge commits only, "Build and test" passing on a branch that is current with `main`, review threads resolved, no force pushes, no deletion, and no bypass, so the owner's own changes go through the same door. `release-tags`: only an organization owner may create, move or delete a `v*` tag, which is the production gate of decision 0011. Verified by the agent after the apply: both read back as active with the rules the files define, and the first pull request under them was mergeable with the check green. GitHub added one field the file does not set, an extra approval for unattributed changes, which its documentation says has no effect when zero approvals are required. A change to a ruleset is a change to its file here, reviewed, then applied by the owner with `gh api --method PUT`.

What is not enforced yet:

- **Signed commits.** The agent's commits are unsigned, and the `main` ruleset does not require signatures. Deferred until the agent has a signing key; what it leaves open is that authorship in the log is asserted, not proven.
