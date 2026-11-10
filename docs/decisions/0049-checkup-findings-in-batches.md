# 0049: The checkup files its findings in batches, one per fixing pull request, and few candidates earn a rule

- **Status:** Decided
- **Date:** 2026-11-10
- **Settles:** Issue-273: the grain of what the checkup files and what earns a new rule. On 2026-11-09 the checkup of 2a146cf filed ten findings, one issue per breach (Issue-257 to Issue-266). The owner found that grain too small to work from and regrouped the findings by hand into six batches (Issue-267 to Issue-272). The owner then judged the candidate rules by a test of what earns a rule.
- **Supersedes:** decision 0034 in three places: each finding as a checkpoint of its own, the cap of ten issues, and an accepted candidate filed as an issue of its own. The rest of 0034 stands: a finding is an issue labeled `finding` citing one rule, and a closed `excused` issue is the suppression record.

## Decision

**A batch issue per pull request that would fix its findings.** The verified findings are grouped by the pull request that would fix them. Each group is one batch issue under one milestone, and findings whose milestones differ go in different batches. Each finding stays one issue labeled `finding`, a sub-issue of its batch, so the deduplication still reads one breach per issue and an excuse still closes one breach. The batch is the checkpoint, and its pull request closes the batch and each finding. A batch that would be too large to review line by line is split, and each half counts as a batch. The batch also lists what a pass reported that the session has not read line by line, and the notes in files its pull request touches anyway.

**The cap counts batches, at most six a run.** The owner triages and schedules pull requests, not breaches. A batch's size is bounded by being one pull request reviewable line by line (`docs/process/code-changes.md`, rule 7). A batch that holds only a rule the owner accepted is outside the cap, because the owner asked for it.

**A note is never filed on its own.** It rides in a batch whose pull request touches its file anyway, whether that batch is filed in this run or open from an earlier one, and otherwise it is dropped. A later run of the area finds it again.

**Few candidates earn a rule.** A candidate becomes a rule only when it does at least one of three things: it guards security, money or the game's data; it is enforced by a machine, so keeping it costs nothing after the first fix; or it loosens a rule that already produces false findings. Anything else has its instances fixed in a batch and no rule. An accepted rule goes into the batch whose pull request touches its document (`docs/process/best-practices.md`, rule 12).

The procedure is `docs/runbooks/checkup.md`, rules 6 to 10, and the triage is `docs/process/code-changes.md`, rule 28.

## Considered and not chosen

- **One issue per finding, each its own checkpoint (0034).** Precise to deduplicate and to excuse, but ten small checkpoints for what six pull requests fix, and the owner did the grouping by hand.
- **A batch with its findings as task items only, no sub-issues.** One issue per pull request and nothing else, but the deduplication would key on prose. An excuse would also have no issue to close with its label.
- **The cap of ten kept, counted in findings.** It bounds the issues filed, but a run would stop partway through a group, leaving a batch whose pull request fixes half of what it touches.
- **A rule for every candidate the owner accepts.** That is the shape 0034 had. Rules that only review enforces are broken by each iteration and refiled by each checkup, which spends the work on adherence rather than on the game.
- **A label for batch issues.** Easier to search for, but one more label to triage. A batch is found by the line `From the checkup of`, which only a batch's body carries.

## Where it is described

`docs/runbooks/checkup.md`; `.claude/skills/checkup/`; `docs/process/code-changes.md`, rule 28; `docs/README.md`, the index.
