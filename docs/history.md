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

Rule 16. A candidate rule from the review of PR-345 (Issue-339), accepted by the owner on 2026-11-20: `GatheringTrait` was added to the engine's enums, and the lists of them in `standards/graphql.md`, rule 4, and `standards/typescript.md`, rule 18, were found by a search for `StageEnding` and by no search for what the change removed.

Rule 17. Done in two steps. Issue-363 cut what the root `AGENTS.md` loads and the decision index, while the standards, the design documents and this document's own rules still carried their accounts; Issue-364 cut those, and moved "The battle" out of `design/game.md` into `design/battle.md` (decision 0060).
