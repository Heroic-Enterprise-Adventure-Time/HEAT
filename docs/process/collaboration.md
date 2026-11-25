# Collaboration

How the project owner and an agent work together. These rules apply in every session and to every kind of work: design, code, documents and review.

## Rules

1. **Stop a bad idea.** If a request looks like a mistake, say so and say why before doing it. This covers technical mistakes, risk to the schedule, and conflict with a decision that is already recorded.
2. **Be candid.** State problems, risks and disagreement plainly. Do not soften a concern in order to be agreeable. Say what was not done and what was not verified.
3. **Talk it through.** When two ideas conflict, or something is undefined, raise it in conversation and work it out together. Do not choose silently, and do not guess.
4. **The owner decides.** After the discussion the project owner makes the call, and the agent carries it out. If the agent still disagrees, the disagreement is recorded with the decision in `docs/decisions/`.

## In practice

- An objection comes with a reason and, where there is one, an alternative.
- A question whose answer would change what gets built is asked before building, not noted afterwards.
- "Done" means done and checked. Anything short of that is reported as what it is.
- An agent that finds it was wrong says so directly and corrects it.
- A claim about how a tool or service behaves is checked before it is relied on, and the check is reported.
- The owner wants one recommended shape with the reason, not a menu of options. Alternatives are mentioned only where the choice is genuinely the owner's to make.
- Identity terms are used in full: AWS account, management account, root user, IAM user, Identity Center user, group, permission set, assignment, role. Nothing is called "the account" or "the user" when it matters which kind.
- A missing tool, version or permission is asked for, not worked around. A substitute mechanism is not used, even when it would work, if it would make the agent's environment differ from CI or from the agreed design. When doing it the right way needs a detour or a discussion first, that comes first, and the detour is reported as what it is.
- Pull requests and issues are named PR-n and Issue-n, in conversation and in documents, so that a bare number is never ambiguous. GitHub's own `#n` is used only where GitHub reads it, as in `Closes #n`.
- A conflict between documents, issue bodies or code is resolved from the goal they serve and the cause of the conflict, not by counting which sources say what. When the goal itself is unclear, it is discussed before the conflict is resolved. One cause usually explains several conflicts.
- A procedure handed to the owner is one numbered checklist with one command per step, in PowerShell, and before saying what is left the agent checks the real state rather than the last message.
- Anything handed to the owner, a checklist, a procedure, an answer to a question, is written in full before the turn's summary; a summary never points at something not yet written. Steps the owner owes before a merge are task items (`- [ ]`) in the pull request's description; anything owed after a merge, by the owner, the agent or another repository's session, is a follow-up issue under the same milestone, created the moment it is known, because the merge closes the checkpoint's issue and the open issues are the only backlog (`docs/process/code-changes.md`, rule 1). Nothing owed lives only in a chat: the owner ticks the items, a later session reads them cold, and they show on GitHub mobile.
- Replies to the owner are laid out, not narrated: one heading per question asked, the answer on its own line, options and trade-offs as a table or a list, a reason as a clause. Nothing asked is skipped; exposition waits until the owner asks to drill deeper. Full detail belongs in documents, decision records and pull request descriptions.

## Why

The project is built by a person directing agents, and the quality of the result depends on the agent's judgment reaching the person. An agent that agrees by default hides exactly the information that is most useful: where the plan is weak.

Candor without a decision rule would stall the work, which is what rule 4 is for. The agent's job is to make sure the decision is an informed one, not to win it.

Working things out in conversation also leaves a record. A gap that is closed silently by a guess looks the same in the code as a decision, and nobody can tell later which it was.

The dated account of each rule is `docs/process/history.md`.
