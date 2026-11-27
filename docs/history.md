# How the rules for documents got here

The dated accounts behind the rules of `docs/README.md`, "How documents are written": what happened, in which review or session, and what was found. Each rule says what to do, with a clause of reason and a reference; the account that reference stands for is here, and opens with its rule's number.

Nothing loads this file, and no session reads it at its start (`docs/README.md`, rule 17). It is read when a rule's reason is in doubt, or when a rule is about to be changed, by a search for the rule's number. An account is added here in the pull request that adds or changes the rule, and is not rewritten afterwards.

## README.md

Rule 5, the search after a rename. From the review of PR-192 (Issue-155), where `ENGINE_UPDATED` survived in two diagrams and a standard while the entries around them were rewritten.

Rule 5, a loader names and does not count. From the review of PR-243 (Issue-242), which fixed three such phrases and nearly wrote a fourth.

Rule 9, an ARN AWS publishes. The owner's ruling of 2026-11-17, recorded in decision 0055, for the managed OpenTelemetry layer's ARN.

Rule 10. From the review skill's first run (decision 0033).

Rule 11. From the review of PR-163 (Issue-147).

Rule 12. From the review of PR-179 (Issue-177).

Rule 13. From Issue-180.

Rule 14. From Issue-318, which found the dev server's procedure, the shell's quirks and a list of lessons in one laptop's memory and one private file.

Rule 15. A candidate rule from the review of PR-342 (Issue-336), accepted by the owner on 2026-11-20: decision 0058 marked five items of `design/game.md` and missed two, and amended three records and missed 0052.

Rule 15, its last sentence. A candidate rule from the review of PR-387 (Issue-383), accepted by the owner on 2026-11-26: decision 0061 and `process/assets.md`, rule 39, named the art build's glyphs moving to scene roles, and the search of the documents missed `scripts/icon-set.mjs`, which reads the same two colours for its sheet's numbers.

Rule 16. A candidate rule from the review of PR-345 (Issue-339), accepted by the owner on 2026-11-20: `GatheringTrait` was added to the engine's enums, and the lists of them in `standards/graphql.md`, rule 4, and `standards/typescript.md`, rule 18, were found by a search for `StageEnding` and by no search for what the change removed.

Rule 17. Done in two steps. Issue-363 cut what the root `AGENTS.md` loads and the decision index, while the standards, the design documents and this document's own rules still carried their accounts; Issue-364 cut those, and moved "The battle" out of `design/game.md` into `design/battle.md` (decision 0060).

Rule 18. A candidate rule from the review of PR-369 (Issue-353), accepted by the owner on 2026-11-25: the cart's jolt and its unfaded wreck in `process/assets.md`, rule 31, still read as unbuilt after Issue-353 built them, and the review found them by the issue's number.

Rule 19. A candidate rule from the review of PR-376 (Issue-375), accepted by the owner on 2026-11-26: the comment on `packages/AGENTS.md`'s new limit said "about 2K of room", was corrected to 1.5K before the pull request opened, and would have gone stale at the next rule added to `typescript.md`.

Rule 20. A candidate rule from the review of PR-376 (Issue-375), accepted by the owner on 2026-11-26: `standards/typescript-dependencies.md` was the first document of its kind, with neither a Rules nor a Why section, and its occasions for reading were listed three times, in its opening, in `packages/AGENTS.md` and in this index, each differently.

Rules 2, 3 and 20, 2026-11-27 (Issue-428). The standards' rules were sorted into the three tiers of decision 0060, as amended by Issue-428, and each standard was given a detail file, `<standard>-detail.md`, after `typescript-dependencies.md`, the first, was renamed. Rule 20 now says what such a file holds besides a rule's detail, rule 2 that a standard's reasons are there, and rule 3 that the tiers are how a standard makes room.
