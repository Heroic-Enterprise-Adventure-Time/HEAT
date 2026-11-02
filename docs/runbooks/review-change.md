# Reviewing a pull request against the standards

How a pull request is reviewed against the standards before the owner reads it: a model-driven review, run from a session of its own that did not write the change, whose findings are review threads on the pull request. The standards it reviews against are the documents rule 4's table names for the paths the change touches; the floor beneath it is lint, which CI has already run on the pull request (`docs/standards/typescript.md`, rule 16; `docs/standards/terraform.md`, rule 17). The Claude Code skill `.claude/skills/review-change/` points here, and decision 0033 records why the review runs this way. The rules below are the procedure; the brief the reviewing session works from is at the end.

## Rules

1. **When, and by whom.** After the pull request opens and Auto-fix is on (`docs/process/code-changes.md`, rule 23), once per pull request, in a session started for the review and nothing else: not the session that wrote the change, not a fork of it, not a subagent of it. The owner starts it, or starts it from the card the writing session proposes; the session is given the brief below and the background the app requires, which says nothing of the change, and no steps of its own. A later run, after the threads are answered, is the owner's call.
2. **Lint has run.** Every check on the pull request is green before the review starts (`gh pr checks <n>`; lint and tflint are separate checks of the "Build and test" workflow); where one is red or still running, the session says so and stops. The reviewer reports nothing a lint rule expresses.
3. **The range is the pull request's.** The session reads the base and head from the pull request (`gh pr view <n> --json baseRefName,headRefName`) and the diff from it (`gh pr diff <n>`), so a hotfix against `release` is compared with `release` (decision 0021). It reads neither the pull request's description nor the issue: it reviews what was written, not what was meant, and the owner reads the description.
4. **The documents, by the paths touched.** Every document a path matches is read in full before the diff; a path that matches none is listed in the review as not reviewed.

   | Path touched | Documents |
   | --- | --- |
   | `packages/**`, and any `.ts`, `.mjs` or `.js` file, `package.json`, `tsconfig*.json`, `eslint.config.mjs` or `manifest.json` elsewhere | `docs/standards/typescript.md` |
   | `.github/**`, `.claude/settings.json`, `terraform/allowed-resource-types.txt` | `docs/process/code-changes.md` and `docs/process/best-practices.md`, which hold the guardrails |
   | `packages/client/**` | `docs/standards/angular.md` as well |
   | `packages/hub/**` | `docs/standards/graphql.md` as well |
   | `terraform/**` | `docs/standards/terraform.md` |
   | `README.md` at the repository root | `docs/README.md`, which indexes it as a document (Issue-177) |
   | `docs/**`, `AGENTS.md`, `CLAUDE.md`, `.claude/**` | `docs/README.md` |
   | `docs/decisions/**` | `docs/decisions/README.md` as well |

5. **The reviewer reads and does not write.** It reads the files the diff touches at the pull request's head, in full, and the files they import, for the context a hunk lacks (`git fetch origin <head>`, then `git show origin/<head>:<path>`; nothing is checked out and no worktree is made). It changes no file, pushes nothing and never merges. Its only writes are the review and the comment of rules 7 and 8.
6. **A finding cites one rule.** Each finding is one breach of one numbered rule: the severity, the document and rule number, what breaches the rule and the fix, in one or two lines. At most 10 findings, the most serious first. The severities are **blocks**, a breach of a rule that guards a guardrail, security, a secret, records or money; **fix**, any other rule breached; and **note**, a breach with no effect beyond the reader. Zero findings is a review, not a failure.
7. **A finding is a review thread.** The findings are posted as one review on the pull request, event `COMMENT`, never `APPROVE` or `REQUEST_CHANGES`, which are the owner's (`gh api repos/{owner}/{repo}/pulls/<n>/reviews`). A finding on a line of the diff is an inline comment on that line; a finding on a touched file outside its hunks is anchored on the nearest line of that file in the diff, because the endpoint's comments take a path and a line and a comment without one fails the whole review; the review's body lists the paths not reviewed, or says "No findings". The request is built with `gh api`'s field flags (`-f`, `-F`), not a JSON body, which needs `jq`. Each comment opens with `**Review skill · <severity> · <document>, rule N**` and ends with the line `_🤖 Posted by the review skill ([Claude Code](https://claude.com/claude-code))_`, because the review posts under the owner's login and a reader must be able to tell the two apart.
8. **Candidate rules go to the owner.** What the reviewer would report but no numbered rule covers is one comment on the pull request headed "Candidate rules", each worded as a rule for the document it would join, with the place that prompted it, and with the same closing line. The owner accepts or rejects; an accepted one changes the document in the same pull request where the change is small, and as an issue otherwise. Nothing of this is a finding.
9. **Correctness is the built-in code review.** The standards say how code is written, not whether it works. After posting, the session runs Claude Code's `code-review` skill, `medium --max-findings 10 --comment <n>`, which posts its findings as inline comments on the same pull request. The skill keeps the level and the cap last used, so the session reads the level the skill reports and states it in its final message; the first run, 2026-10-25, asked for `medium` and ran at high.
10. **The threads go to the writing session.** Auto-fix relays each thread to the session that owns the branch, where it is talked through with the owner, who decides; the agent pushes the agreed change as a commit, replies on the thread with what changed or why not, and the owner resolves (`docs/process/code-changes.md`, rule 24). A finding is not fixed because it was posted. A disagreement with a rule as written, rather than with the finding, is a proposed change to the document, raised with the owner (`docs/process/collaboration.md`, rule 3).

## The reviewing session's brief

What the session is told when it starts, with the number filled in. Nothing is added to it.

```text
Review pull request <n> of the HEAT repository against its written standards, following docs/runbooks/review-change.md on the pull request's head. You did not write the change and know nothing of the conversation that produced it; do not read the pull request's description or its issue. Read the standards documents the runbook's table maps to the paths the diff touches, in full, before the diff. Report only a breach of a numbered rule, cited by document and number; what no rule covers is a candidate rule. Post the findings as the runbook's rules 7 and 8 say, then run the built-in code review as rule 9 says. Change no file, push nothing, merge nothing. Read an ambiguous rule as its document's "Why" section means it; where it is still ambiguous, do not report. A rule a document lists under "Held back" is not breached by code it names as held back.
```

## Why

The review is a session of its own because a model that wrote a change reads it the way it meant it, and a session started for the review has no conversation to inherit: the isolation is by construction, not by a setting. The first shape, a subagent inside the writing session, depended on a definition loading and on a flag, and its first run showed the subagent carrying the session's instructions anyway (decision 0033).

The findings are review threads because the pull request is the review surface this project already has (`docs/process/code-changes.md`, "Why"): a thread carries the rule, the reply and the resolution, the `main` ruleset refuses a merge while a thread is open, and a person reads it on GitHub, in the browser and on mobile, now and later. A finding fixed before the pull request opened left no such trace.

One rule per finding keeps the review bound to the documents: a finding is checkable against a sentence the owner wrote, and a reviewer that cannot cite one is asked to propose the sentence instead. The cap exists because ten findings are read and forty are skimmed; the severities put a guardrail breach above a wording.

The built-in code review runs beside the standards review because the two ask different questions: whether the code is written as this project writes it, and whether it works. Neither answers the other.
