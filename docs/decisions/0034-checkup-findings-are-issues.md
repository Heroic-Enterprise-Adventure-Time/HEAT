# 0034: The checkup's findings are issues, and a closed `excused` issue is the suppression record

- **Status:** Decided
- **Date:** 2026-10-26
- **Settles:** Issue-147: where a whole-tree finding goes, how one that is not to be fixed is remembered, and how much one run may file. Decision 0033 settles that the checkup exists, runs at a pause from a session on the subscription, and starts where lint and the review skill stop; it does not settle the surface.

## Decision

**Each finding is one issue**, labeled `finding`, under the milestone of the work its fix would be, citing one numbered rule of one standards or process document with the files, the breach and a proposed shape of the fix, created under the owner's login with a closing line that says the checkup skill filed it. The open issues are the backlog and there is no other list (`docs/process/code-changes.md`, rule 1), so a finding the owner accepts is a checkpoint by being left open, and nothing has to be copied from a report into the backlog.

**A closed issue labeled `excused` is the suppression record.** The owner closes a finding that is not to be fixed with the label and a one-line comment giving the reason; the checkup reads every `finding` issue, open and closed, before filing, and does not raise an excused breach again, however long ago it was excused. A finding closed without the label was fixed, and the same breach found again is filed anew, naming the old issue. An excuse that is a standing decision is also written under "Held back" in the standards document whose rule it excuses, or into a decision record, in a pull request of its own, so that the document says what the code does.

**One run files at most ten issues**, the most serious first and, within a severity, one from each area in turn, so that a whole-tree run shows every area, and counts the rest per area in the session; a later run of one area picks them up. The cap is the review skill's cap for the same reasons: ten are triaged and forty are skimmed, and a run on the subscription is bounded by its usage limits (decision 0033).

**Candidate rules are not findings.** What a pass would report but no rule covers goes to the owner in the session's final message, worded as a rule for the document it would join; an accepted one is filed as an issue for the document change before the session ends, because chat is the one surface nothing reads back (`docs/process/collaboration.md`, "In practice"). The reviewer stays bound to the sentences the owner wrote.

**One pass per area, the session verifying.** The tree is reviewed one area at a time, each pass with only its documents and files in view, and the session reads every cited line itself before filing. The procedure is `docs/runbooks/checkup.md`.

## Considered and not chosen

- **One report issue per run**, with every finding as a task item. One thing to read, but the owner would copy each accepted item into an issue of its own to work it, and a declined item would be remembered nowhere the next run reads; the dedup would be against prose.
- **A suppression file in the tree**, a list of rule-and-path pairs the checkup skips. Deterministic to match, but a second list beside the backlog, changed through a pull request for a one-line excuse, and silent about why. The standards documents' "Held back" sections already hold the standing excuses with their reasons, and the closed issue holds the one-off ones with theirs.
- **A pull request of fixes**, the checkup fixing what it found. A whole-tree change is not reviewable line by line (`docs/process/code-changes.md`, rule 7), and a finding is a judgment the owner weighs, not a correction to apply; the review skill's first shape was dropped for the same reason (decision 0033).
- **No cap.** A first run over a tree whose rubrics are a day old could file dozens; the owner reads ten and the rest wait for a run that is asked for. The first run, 2026-10-25, found 1 blocks, 18 fix and 15 note findings and filed ten.
- **The cap filled in the table's order within a severity.** The first run did this and filed nothing from Terraform, Documents or Art, whose fix findings all fell below the cap; one per area in turn shows the owner every area in one run.
- **Candidate rules filed as issues at once.** Each would be a backlog item the owner had not agreed to; asking first keeps the documents the owner's.

## Where it is described

`docs/runbooks/checkup.md`; `.claude/skills/checkup/`; `docs/process/code-changes.md`, rule 28; `docs/process/best-practices.md`, rule 9; `docs/README.md`, the index.
