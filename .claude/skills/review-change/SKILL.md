---
name: review-change
description: Review the branch's change against HEAT's written standards before its pull request opens. Lint first; then a fresh read-only subagent reviews the diff against main under the documents the runbook maps to the paths touched, citing one numbered rule per finding; then the built-in code-review for correctness. The session fixes what it agrees with and lists the rest under a "Review" heading in the pull request. Use when a change is ready for its pull request, or when asked to review the branch against the standards.
---

# Review a change

Follow `docs/runbooks/review-change.md`, step by step: it holds the rules, the table of documents by path, where findings go, and the brief the reviewer receives. Decision 0033 is why the review runs here, in the session, and not in CI. What this file adds is only how Claude Code runs it:

- The reviewer is the Agent tool with `subagent_type: standards-reviewer` (`.claude/agents/standards-reviewer.md`), a fresh agent, never a fork; its prompt is the runbook's brief with the three placeholders filled, and nothing else. If the Agent tool answers that the type is not found, stop and say so (runbook, rule 5); do not run the brief in another agent type.
- The built-in code review is the Skill tool: `code-review`, arguments `medium --max-findings 10 origin/main...<branch>`, with the worktree's branch named (runbook, rule 9).
