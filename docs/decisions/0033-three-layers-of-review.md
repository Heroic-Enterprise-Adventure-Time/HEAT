# 0033: Three layers of review: lint in CI, the review skill before a pull request, the checkup skill at a pause; the model-driven layers run from sessions on the subscription

- **Status:** Decided
- **Date:** 2026-10-23; written 2026-10-25 (Issue-146)
- **Settles:** Issues 144 to 147: how a change and the tree are reviewed beyond the owner's reading, and where the reviewing model runs and is paid for.

## Decision

**Three layers, each starting where the one below stops.**

1. **Lint in CI** (Issue-144). ESLint at the strictest published tiers and tflint, run by "Build and test" on every pull request, so a finding fails it (`docs/standards/typescript.md`, rule 16; `docs/standards/terraform.md`, rule 17). Deterministic and free. It is the floor: a convention a lint rule can express is a lint rule, never prose, and nothing above it re-reports what it catches.
2. **The review skill** (Issue-146). `.claude/skills/review-change/`, run from the session before the pull request opens (`docs/process/code-changes.md`, rule 23). A fresh subagent with read-only tools reviews the diff against `main` under the standards for the paths it touches, cites one numbered rule per finding, returns at most ten, most serious first, and returns what no rule covers as candidate rules; the built-in `code-review` runs beside it for correctness. The session fixes what it agrees with and lists the rest under the "Review" heading of the pull request's description (rule 9). The procedure is `docs/runbooks/review-change.md`.
3. **The checkup skill** (Issue-147). Run at a pause, a checkpoint merged or a step of the build order begun (`docs/process/best-practices.md`, rule 9), over the whole tree rather than a diff, with each finding filed as an issue.

**The model-driven layers run from Claude Code sessions, as skills, on the owner's subscription.** Not in GitHub Actions and not through an API key. The rubrics are the documents a session already loads; the session is where a finding is fixed by the hands that can fix it; no billing beyond the subscription is introduced; and nothing of the model runs where the owner cannot watch it. The subscription's usage limits bound the cost, which is why the review is one run per pull request and capped.

**The reviewer is not the writer.** A subagent with a fresh context, read-only tools and no `CLAUDE.md`, given the diff and the documents and nothing from the session, because a model that wrote a change reads it as it meant it.

**A finding cites a rule, or it is a candidate rule.** The review is bound to what the owner wrote in `docs/standards/`; a reviewer that cannot cite a sentence proposes one, and the owner decides whether the documents grow.

## Considered and not chosen

- **Claude Code in GitHub Actions with an OAuth token.** It would draw on the subscription too (the documentation was read 2026-10-23), but it runs outside a session: the finding lands on the pull request instead of in the session that fixes it, and the model's permissions are configured in a second place. The owner chose sessions.
- **Claude Code in GitHub Actions with an API key.** Introduces API billing beside the subscription, for the same review.
- **Anthropic's hosted Code Review.** Team and Enterprise plans only.
- **CodeQL.** A paid add-on on a private repository; not proposed.
- **A required check in CI.** A model's finding is a judgment the session and the owner weigh, not a gate; lint is the gate.
- **One skill per topic**, an Angular review, a GraphQL review, a Terraform review. The rubrics live in `docs/standards/`, one document per area, and one skill picks the documents by the paths the diff touches; a skill per topic would restate them.
- **Findings as review comments on the pull request.** The pull request does not exist when the review runs, and the owner reads the description first; the owner turns an item into a thread where one is wanted.

**Deferred:** CodeQL, if the repository becomes public or the add-on is paid for; the hosted Code Review, if the plan changes; running the review outside a session, which an OAuth token in Actions would allow, for a change that arrives without one. Today that is Dependabot's pull requests, which lint and the owner review.

## Where it is described

`docs/process/code-changes.md`, rules 9 and 23; `docs/runbooks/review-change.md`; `.claude/skills/review-change/` and `.claude/agents/standards-reviewer.md`; `docs/standards/typescript.md`, rule 16, and `docs/standards/terraform.md`, rule 17, for the floor.
