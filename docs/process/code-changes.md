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

## Why

**Checkpoints before code.** Agreeing the end of a piece of work before starting it is what keeps a pull request small. It also means review compares the change against something already agreed, instead of discovering the scope in the diff. The issue is where the agreed end is written down, next to the pull request that delivers it and where a new session finds it cold; a list kept in a note goes stale silently, an issue is closed by the merge. Added 2026-10-15 when the first platform checkpoints were agreed.

**Everything through a pull request.** In a session that runs in the cloud, the project owner cannot see the agent's working tree. The pull request is the review surface: a diff, a description and a merge button.

**Merge commits, never squash.** The history then shows who wrote each commit and who merged it. Agents write nearly all of the code in this project and a person reviews and merges it; the commit log should say that without anyone having to explain it.

**Documents with the change.** A document that describes behavior is only useful while it is true. Changing both together is the only reliable way to keep them in step.

**The owner applies.** This project's Terraform runs with administrator access inside HEAT's AWS accounts, through a role the organization layer placed there. A mistake in an apply reaches a whole account. Review before apply is the control that exists today, so the apply stays with the person who reviewed. The same two rules hold in the `dcg-platform` repository, whose stack reaches every account in the organization.

## What enforces this

Most of this document is an agreement, not a mechanism. What is enforced today:

- `.claude/settings.json` denies an agent the commands `git push origin main`, `git push origin HEAD:main` and `gh pr merge`. This is a guardrail against the obvious forms, not a guarantee: a command pattern can be worded around.
- The agent's AWS profiles carry read-only roles. An agent cannot apply Terraform or run a changing command, even by mistake.
- The repository's merge settings allow merge commits only; the squash and rebase buttons are off.

What is not enforced yet:

- **Branch protection on `main`.** Available on the organization's current plan and not yet configured. Until it is, nothing stops a push to `main` except the agent's settings above and the owner's habit.
- **Checks on pull requests.** There is no CI yet. Until there is, a pull request arrives with the agent's account of how it was verified and nothing else.
