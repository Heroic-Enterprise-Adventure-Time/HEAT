# 0033: Three layers of review: lint in CI, the review skill on a pull request, the checkup skill at a pause; the model-driven layers run from sessions on the subscription

- **Status:** Decided. The repository went public on 2026-11-02 (Issue-178), which is the condition "Deferred" below names for CodeQL, and CodeQL's default setup has been on since then.
- **Date:** 2026-10-23; the review skill's surface decided 2026-10-25 (Issue-146); the checkup's surface decided 2026-10-26 in decision 0034 (Issue-147)
- **Settles:** Issues 144 to 147: how a change and the tree are reviewed beyond the owner's reading, and where the reviewing model runs and is paid for.

## Decision

**Three layers, each starting where the one below stops.**

1. **Lint in CI** (Issue-144). ESLint at the strictest published tiers and tflint, run by "Build and test" on every pull request, so a finding fails it (`docs/standards/typescript.md`, rule 16; `docs/standards/terraform.md`, rule 17). Deterministic and free. It is the floor: a convention a lint rule can express is a lint rule, never prose, and nothing above it re-reports what it catches.
2. **The review skill** (Issue-146). `.claude/skills/review-change/`, run on a pull request from a session started for the review and nothing else (`docs/process/code-changes.md`, rules 23 and 24). It reads the base, head and diff from the pull request, reviews the diff under the documents the runbook maps to the paths it touches, the standards under `docs/standards/` and the document rules of `docs/README.md` and `docs/decisions/README.md`, cites one numbered rule per finding, posts at most ten as review threads, most serious first, posts what no rule covers as candidate rules in one comment, and runs the built-in `code-review` with its findings posted as comments too. The threads reach the writing session through Auto-fix and are talked through with the owner, who decides and resolves. The procedure is `docs/runbooks/review-change.md`.
3. **The checkup skill** (Issue-147). Run at a pause, a checkpoint merged or a step of the build order begun (`docs/process/best-practices.md`, rule 9), over the whole tree rather than a diff, with each finding filed as an issue.

**The model-driven layers run from Claude Code sessions, as skills, on the owner's subscription.** Not in GitHub Actions and not through an API key. The rubrics are the documents a session already loads; no billing beyond the subscription is introduced; and nothing of the model runs where the owner cannot watch it. The subscription's usage limits bound the cost, which is why the review is one run per pull request and capped.

**The reviewer is not the writer, by construction.** A session of its own has no conversation to inherit; it is not a fork and not a subagent of the writing session, and it never reads the pull request's description or the issue, so it reviews what was written rather than what was meant.

**The pull request is the review surface.** A finding is a thread with its rule, the writing session's reply and the owner's resolution, which the `main` ruleset requires before a merge; a person reads it on GitHub now and a session finds it later. The review posts under the owner's login, because the agent uses the owner's `gh` credentials, so every comment opens with "Review skill" and the rule and closes with a line saying it was posted by the skill. A GitHub App identity for the agent would remove that caveat and is a change of its own, not made here.

**A finding cites a rule, or it is a candidate rule.** The review is bound to what the owner wrote; a reviewer that cannot cite a sentence proposes one, and the owner decides whether the documents grow. The first run, on the pull request that introduced the skill (PR-162, 2026-10-25), posted one finding and three candidate rules and found six places where the runbook's text and the run differed, all fixed on that pull request; one candidate became `docs/README.md` rule 10, a procedure lives in one document, after the run found its own procedure restated in five.

## Considered and not chosen

- **A review before the pull request opens, by a subagent inside the writing session.** The first shape of Issue-146, built and run once on its own branch. Its isolation rested on a subagent definition with a read-only tool list and no `CLAUDE.md`, which the writing session could not load because the definition was not in its project directory at start; the general agent that stood in carried the session's instructions and the owner's memory, which it reported itself. And the findings it fixed before the pull request opened left no trace a person could read. The owner chose the pull request as the surface on 2026-10-25, for the trail and for an isolation that needs no setting.
- **Claude Code in GitHub Actions with an OAuth token.** It would draw on the subscription too (the documentation was read 2026-10-23), but it runs where the owner cannot watch it, and the model's permissions are configured in a second place. The owner chose sessions.
- **Claude Code in GitHub Actions with an API key.** Introduces API billing beside the subscription, for the same review.
- **Anthropic's hosted Code Review.** Team and Enterprise plans only.
- **CodeQL.** A paid add-on on a private repository; not proposed.
- **A required check in CI.** A model's finding is a judgment the session and the owner weigh, not a gate; lint is the gate.
- **One skill per topic**, an Angular review, a GraphQL review, a Terraform review. The rubrics live in `docs/standards/`, one document per area, and one skill picks the documents by the paths the diff touches; a skill per topic would restate them.
- **An approving or change-requesting review.** The skill posts with event `COMMENT` only; approval and the request for changes are the owner's.

**Deferred:** CodeQL, if the repository becomes public or the add-on is paid for; the hosted Code Review, if the plan changes; a GitHub App identity so that the skill's threads are not under the owner's login; reviewing a pull request that no session owns, Dependabot's today, which lint and the owner review.

## Where it is described

`docs/process/code-changes.md`, rules 9, 23, 24 and 28; `docs/runbooks/review-change.md`; `.claude/skills/review-change/`; `docs/runbooks/checkup.md`; `.claude/skills/checkup/`; `docs/standards/typescript.md`, rule 16, and `docs/standards/terraform.md`, rule 17, for the floor.
