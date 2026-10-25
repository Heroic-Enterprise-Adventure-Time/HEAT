---
name: review-change
description: Review the branch's change against HEAT's standards before its pull request opens. Lint first; then a fresh read-only subagent reviews the diff against main under docs/standards/, citing one numbered rule per finding; then the built-in code-review for correctness. The session fixes what it agrees with and lists the rest under a "Review" heading in the pull request. Use when a change is ready for its pull request, or when asked to review the branch against the standards.
---

# Review a change

Follow `docs/runbooks/review-change.md`, step by step: it holds the rules, the table of documents by path, and the brief the reviewer receives. Decision 0033 is why the review runs here, in the session, and not in CI.

- Lint and typecheck first (runbook, rule 2). A red run stops the review.
- Write the diff and the file list to the session's scratchpad (rule 3) and pick the documents from rule 4's table.
- Run the reviewer with the Agent tool, `subagent_type: standards-reviewer` (`.claude/agents/standards-reviewer.md`): a fresh agent, never a fork. Its prompt is the runbook's brief with the three placeholders filled, and nothing else.
- Then run the built-in code review with the Skill tool: `code-review`, arguments `medium --max-findings 10 origin/main...HEAD` (rule 9).
- Judge each finding against its rule; fix what is agreed as commits on the branch; write the "Review" heading into the pull request description (rules 10 and 11; `docs/process/code-changes.md`, rule 9). The agent never merges.
