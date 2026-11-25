# 0060: What a session costs: a compaction window, rules kept apart from their accounts, and a size for what every session loads

- **Status:** Decided; the window's 300,000 and the size's 45,000 are working assumptions, to be moved by a measurement.
- **Date:** 2026-11-25
- **Settles:** Issue-363: the week's limit on the writing model was nearly used with two days left, and the owner asked whether the committed documents could be made cheaper to carry. Where the cost of a session is, what is done about it in the repository, and how the documents are kept from growing back.

## Decision

1. **The cost is the context read again at every call, and it is cut where it is largest.** Six sessions were measured before anything was proposed (Issue-363's body). Re-reading was two thirds to three quarters of an issue's session at the API's price ratios; the documents were 8 to 25% of what was re-read, and the baseline every session starts from, about 96,000 tokens, was more than the documents in four of five.
2. **A session is compacted at 300,000 tokens,** by `autoCompactWindow` in the committed `.claude/settings.json`. Unset, the app waits for about 967,000. Three hundred thousand is within the sizes at which the app's idle compaction had already cut sessions, 227,000 to 563,000, with no harm recorded.
3. **The app's idle compaction is not relied on.** It is on by default and cut 30 of 163 pauses of an hour or more in November 2026, every one above 212,000 tokens. It passed over twelve that met its size, Issue-352's two among them.
4. **A rule carries a clause of reason and a reference, and its account is kept apart,** in the decision record where there is one and otherwise in a `history.md` beside the document, which nothing loads. The four documents the root `AGENTS.md` loads were cut so, from 50,358 bytes to 39,782 with five rules added, and `docs/process/code-changes.md`'s list of what enforces it became `docs/process/enforcement.md`.
5. **What the root `AGENTS.md` loads is held to 45,000 bytes** by `scripts/check-loaded-documents.mjs`, a step of the "Build and test" job. A pull request that passes it makes room or raises the number and says why.
6. **The decision index is titles and status words.** A row had been a copy of its record's Status line; the index was 24,631 bytes and is 12,205, and every reference an old row held was checked to be on its record.
7. **A change to any of this is measured** with `scripts/session-profile.mjs`, on the first issue's session started after its merge.
8. **Skills and connectors are left on.** A committed setting can turn them off (`skillOverrides`, `deniedMcpServers`, `disableClaudeAiConnectors`); the owner's call on 2026-11-25 was not to.

## Facts checked

- **The settings.** `autoCompactWindow`, `idleCompaction`, `CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS`, `skillOverrides` and `disableClaudeAiConnectors` are documented at code.claude.com/docs/en, in `settings-reference.md` and `env-vars.md`, each with the scope "Any file" where it is a setting; read on 2026-11-25. The changelog of release 2.1.332 has "Fixed idle compaction being skipped for subscribers still well under their weekly limit"; the sessions measured ran on 2.1.331 and earlier.
- **Idle compaction in the transcripts.** Each idle compaction is recorded as `precomputed`, with a summary dated 55 or 56 minutes after the session's last request.
- **The baseline's parts,** from the transcript's own record of the first request, by characters: the app's 52 tool schemas 43%, what `AGENTS.md` loads with the memory index 21%, the system prompt 15%, the skill listing 8%, the names of the connectors' deferred tools 5%.
- **Not checked.** That the desktop app honors `autoCompactWindow` from the project's file: the first session started after the merge shows it. Why Issue-352 was passed over: the changelog's defect is the likely cause and nothing proves it. How the subscription weighs a cached read, a cache write and output, and one model against another.

## Considered and not chosen

- **Cutting the documents alone,** which is what was asked for. They are a fifth of the baseline and at most a quarter of what a session re-reads; the window acts on all of it.
- **A lower idle threshold,** `CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS`. A compacted session returns to about 110,000 tokens, so compacting one of 150,000 saves little, and the feature is the one that was not dependable.
- **A rule that the owner compacts by hand** when the shape is agreed, when the pull request opens and before a resume. Issue-363 has it tried on one issue first; the window makes the last of the three matter less.
- **A `why.md` beside each document.** One file a directory is one place to search, and four small files would each need an index row.
- **The accounts in decision records only.** Most of them decide nothing: they say which review found what. A record for each would be dozens of records with no alternative in them.
- **Lines as the unit.** `docs/README.md`, rule 3, held a file under about 200 lines and did not bind, because a rule here is one line of a thousand characters.
- **Tokens as the unit.** A job cannot count them with nothing installed, and the first call of a session, which the profiler reads, already gives them.
- **The limit as a line of the checkup.** The checkup runs at a pause, after the rule has been added and loaded by every session between.
- **A size for each document.** One total lets a rule go where its topic is, and a new loaded document counts against the same number.
- **Cutting rule text to reach 32,000 bytes,** the figure the first estimate named. What remains is rules, and Issue-363 changes no rule's meaning.

## Where it is described

`.claude/settings.json`. `docs/process/sessions.md`, rules 16 to 20. `docs/README.md`, rules 3, 8 and 17. `docs/decisions/README.md`, rule 7. `scripts/session-profile.mjs` and `scripts/check-loaded-documents.mjs`, each with its test. `docs/process/history.md` and `docs/process/enforcement.md`. Issue-364 does the same for the standards and `docs/design/game.md`.
