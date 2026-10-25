# Reviewing a change against the standards

How a change is reviewed against the standards before its pull request opens: a model-driven review of the branch's diff, run from the session that wrote it, by a reviewer that is not the writer. The standards it reviews against are the documents rule 4's table names for the paths the change touches; the floor beneath it is lint (`docs/standards/typescript.md`, rule 16; `docs/standards/terraform.md`, rule 17). The Claude Code skill `.claude/skills/review-change/` points here, and decision 0033 records why the review runs this way. The rules below are the procedure; the brief the reviewer receives is at the end.

## Rules

1. **When.** Once, when the session believes the change is ready and before the pull request opens (`docs/process/code-changes.md`, rule 23). The branch holds every commit the pull request will carry and the tree is clean. A later run, after a review comment is answered, is the owner's call.
2. **Lint first.** Where the change touches a path that rule 4 maps to a document under `docs/standards/`, `npm run lint` and `npm run typecheck` pass before the review runs, and `terraform fmt -check -recursive` with tflint where it touches `terraform/`. A red run stops the review; the reviewer is told that lint has passed and reports nothing a lint rule expresses. A change that touches only documents skips this rule.
3. **The diff.** The branch against its merge base with `origin/main`, after `git fetch`: `git diff origin/main...HEAD`, written to a file in the session's scratchpad, with `git diff --name-only origin/main...HEAD` beside it. The reviewer reads the file; nothing is pasted into a prompt.
4. **The documents, by the paths touched.** Every document a path matches is given; a path that matches none is listed to the reviewer as not reviewed.

   | Path touched | Documents |
   | --- | --- |
   | `packages/**`, and any `.ts`, `.mjs` or `.js` file, `package.json`, `tsconfig*.json`, `eslint.config.mjs`, `manifest.json` or `.github/workflows/**` elsewhere | `docs/standards/typescript.md` |
   | `packages/client/**` | `docs/standards/angular.md` as well |
   | `packages/hub/**` | `docs/standards/graphql.md` as well |
   | `terraform/**` | `docs/standards/terraform.md` |
   | `docs/**`, `AGENTS.md`, `CLAUDE.md`, `.claude/**` | `docs/README.md` |
   | `docs/decisions/**` | `docs/decisions/README.md` as well |

5. **The reviewer is not the writer.** The review runs in a fresh subagent, `standards-reviewer` (`.claude/agents/standards-reviewer.md`): a new context, read-only tools, no `CLAUDE.md`, and nothing from the session that wrote the change. It receives the brief below with the diff's path, the documents and the worktree's path filled in, and nothing else: not the issue, not the conversation, not what the change was meant to do, so that it reviews what was written. It may read the files the diff touches, in full, and the files they import, for the context a hunk lacks. Claude Code reads the definition from the session's project directory when the session starts (the subagents documentation, read 2026-10-25: a `.claude/agents/` directory created after the start, or one in a directory added to the session, is not read until a restart), so every session started from the checkout after the definition reached `main` has it. A session where the Agent tool answers that the type is not found does not review with another agent type: a general agent carries the session's instructions and the owner's memory, and is not the reviewer this rule describes. It says so, and the pull request's "Review" heading says the review did not run.
6. **A finding cites one rule.** Each finding is one breach of one numbered rule, written as one item: the severity, the document and rule number, the file and line, and what breaches the rule and the fix, in one or two lines. A finding with no rule to cite is not a finding; it is a candidate rule (rule 8).
7. **Cap and order.** At most 10 findings, the most serious first. The severities are **blocks**, a breach of a rule that guards a guardrail, security, a secret, records or money; **fix**, any other rule breached; and **note**, a breach with no effect beyond the reader. Within a severity, findings follow the diff's order. Zero findings is a report, not a failure.
8. **Candidate rules go to the owner.** What the reviewer would report but no numbered rule covers is returned under "Candidate rules", each worded as a rule for the document it would join, with the place in the diff that prompted it. The owner accepts or rejects; an accepted one changes the document, in the same pull request where the change is small and as an issue otherwise.
9. **Correctness is the built-in code review.** The standards say how code is written, not whether it works. After the standards review the session runs Claude Code's `code-review` skill at `medium` with `--max-findings 10` (Claude Code 2.1.288 or later) over the same range, named with the branch, `origin/main...<branch>`, because a session whose working directory is the checkout on `main` has `main` as `HEAD`. Its findings are handled as rule 10 says, with `code-review` in place of a rule.
10. **Where findings go.** The session reads each finding against its rule and agrees or disagrees; it is not fixed because it was reported. What the session agrees with is fixed as commits on the branch. The pull request's description then carries a "Review" heading (`docs/process/code-changes.md`, rule 9): every finding left, as rule 6 writes it, with the reason it was left; the candidate rules; and the count of findings fixed. A review that found nothing says so under the same heading. The owner turns any item into a review thread, and rule 24 of the same document takes over.
11. **A disagreement with a rule is raised, not ignored.** Where the session disagrees with the rule as written rather than with the finding, that is a proposed change to the document, raised with the owner in the session (`docs/process/collaboration.md`, rule 3), and the finding stays under "Review" until it is decided.

## The reviewer's brief

The prompt the subagent receives, with the three placeholders filled. Nothing is added to it.

```text
You are reviewing one change to the HEAT repository against its written standards. You are not the author and have not seen the conversation that produced the change; review what is written, not what may have been meant.

Inputs:
- The diff of the branch against main: <diff path>. The paths it touches are listed in <file-list path>.
- The standards it is reviewed against: <document paths>. Read each in full before the diff. Their rules are numbered, and only a numbered rule can be cited.
- The worktree: <worktree path>. You may read the files the diff touches, in full, and the files they import, for context. Read nothing else. Change, run and write nothing.

Lint has passed on this change (ESLint at the tiers typescript.md rule 16 names; tflint under terraform/). Do not report anything a lint rule expresses.

Report three lists and nothing else:

1. Findings: at most 10, the most serious first. A finding is one breach of one numbered rule. Write each as one item: the severity; the document and rule number; the file and line; what breaches the rule and the fix, in one or two lines. Severities: blocks, a breach of a rule that guards a guardrail, security, a secret, records or money; fix, any other rule breached; note, a breach with no effect beyond the reader. Within a severity, the diff's order. Zero findings is a valid report; do not pad.
2. Candidate rules: what you would report that no numbered rule covers. Each worded as a rule for the document it would join, with the place in the diff that prompted it. These are not findings.
3. Not reviewed: paths in the diff that no document given covers.

Read an ambiguous rule as its document's "Why" section means it; where it is still ambiguous, do not report. A rule a document lists under "Held back" is not breached by code it names as held back.
```

## Why

The reviewer is a fresh subagent because a model that wrote a change reads it the way it meant it; a context that holds only the diff and the documents reads what is there. Its tools are read-only so that review and change stay in different hands, which is the shape the owner's own review takes.

One rule per finding keeps the review bound to the documents: a finding is checkable against a sentence the owner wrote, and a reviewer that cannot cite one is asked to propose the sentence instead. The cap exists because a list of forty findings is read as noise and a list of ten is read; the severities put a guardrail breach above a wording.

The built-in code review runs beside the standards review because the two ask different questions: whether the code is written as this project writes it, and whether it works. Neither answers the other.

The findings go into the pull request's description, not a chat, because chat is the one surface nothing reads back (`docs/process/collaboration.md`, "Why"): the owner reads the description on review and on GitHub mobile, and a later session finds it cold.
