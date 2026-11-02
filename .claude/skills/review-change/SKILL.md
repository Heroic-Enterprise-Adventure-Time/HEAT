---
name: review-change
description: Review a HEAT pull request against the written standards, from a session that did not write it. Takes the pull request number. Reads the base, head and diff from the pull request, reviews the diff under the documents the runbook maps to the paths touched, posts each finding as a review thread citing one numbered rule, posts candidate rules as one comment, then runs the built-in code-review with --comment. Use when asked to review a pull request against the standards, or when a session is started for that review.
---

# Review a pull request

Follow `docs/runbooks/review-change.md`, step by step, on the pull request's head: it holds the rules, the table of documents by path, how findings are posted and the brief this session works from. Decision 0033 is why the review runs in a session of its own and not in CI. What this file adds is only how Claude Code's arguments map onto the runbook:

- The pull request is `$ARGUMENTS`, a number. This session must not be the one that wrote the change, nor a fork of it (runbook, rule 1); if it is, stop and say so.
- Read the runbook from the pull request's head, `git show origin/<head>:docs/runbooks/review-change.md`, after `git fetch origin <head>`, so a change to the procedure on the branch is the one followed; the standards documents the same way.
- The built-in code review of the runbook's rule 9 is the Skill tool, `code-review`, with `$ARGUMENTS` as its target.
