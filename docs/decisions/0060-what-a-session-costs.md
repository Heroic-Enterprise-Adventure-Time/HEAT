# 0060: What a session costs: a compaction window, rules kept apart from their accounts, and a size for what every session loads

- **Status:** Decided; the window's 300,000 and the size's 45,000 are working assumptions, to be moved by a measurement. Amended 2026-11-27 by Issue-428: the standards' rules are loaded in three tiers, with a detail file beside each standard (item 9).
- **Date:** 2026-11-25
- **Amends:** 0034, where a standing excuse is written: a standard's "Held back" is in its detail file (item 9; Issue-428).
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
9. **A standard's rules are loaded in three tiers** (Issue-428). A rule a session could break before anything catches it is loaded, as its imperative, a clause of reason and its reference (`docs/README.md`, rule 17, applied strictly). A rule a test or lint holds, or one bound to a kind of work that reads the detail file when it starts, such as handling a dependency, is loaded as one line that keeps its number and names the check or the work, so that every citation still holds. The rest is not loaded: the detail a loaded rule does not need at a session's start, the whole of a one-line rule, the standard's "Held back" and its "Why" are in `docs/standards/<standard>-detail.md`, which the review skill and the checkup read whole beside the standard (`docs/README.md`, rule 20). A section of rules that only one area's sessions use is loaded by that area: `typescript.md`'s rules for the client, 13 to 15, became `angular.md`'s 20 to 22, the old numbers retired with pointers (`docs/README.md`, rule 11), and the 5,000 bytes moved from `packages/AGENTS.md`'s limit to `packages/client/AGENTS.md`'s, so no limit was raised. A candidate rule names the tier it would be loaded in. On 2026-11-27 the four standards held 94,789 bytes loaded; after the sort they held 59,228, and each of their loaders has at least a quarter of its limit free. The root's loader, which loads the process documents and no standard, was not sorted.

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
- **Making room by rewording, pull request by pull request** (Issue-428). PR-425 took `typescript.md` back under its limit twice, by 46 bytes and then 77, while a new rule costs hundreds; the tiers make room once.
- **Raising the area limits.** Every session in the area pays for every byte at every call, and most of what pushed them up was not needed at a session's start.
- **The "Why" sections in `history.md`.** A "Why" gives reasons, which the review reads to settle an ambiguous rule; `history.md` holds dated accounts, which are not rewritten.
- **`typescript.md`'s rules 27, 30 and 31 as one line,** which the issue's body proposed. No test or lint holds them, as a search of the tests and `eslint.config.mjs` showed on 2026-11-27, so they stay loaded.
- **A detail file per tier, or the old name `typescript-dependencies.md` kept.** One file per standard is one place to read whole, and one pattern of names needs no exception.

## Where it is described

`.claude/settings.json`. `docs/process/sessions.md`, rules 16 to 20. `docs/README.md`, rules 2, 3, 8, 17 and 20. The four standards and their detail files under `docs/standards/`. `docs/runbooks/review-change.md`, rules 4 and 8, and `docs/runbooks/checkup.md`, rules 4 and 10. `docs/decisions/README.md`, rule 7. `scripts/session-profile.mjs` and `scripts/check-loaded-documents.mjs`, each with its test. `docs/process/history.md` and `docs/process/enforcement.md`. Issue-364 does the same for the standards and `docs/design/game.md`.
