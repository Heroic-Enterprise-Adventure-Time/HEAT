# How the rules for decision records got here

The dated accounts behind the rules of `docs/decisions/README.md`. This file is not a record and has no number. Each rule says what to do, with a clause of reason and a reference; the account that reference stands for is here, and opens with its rule's number.

Nothing loads this file (`docs/README.md`, rule 17). It is read when a rule's reason is in doubt, or when a rule is about to be changed. An account is added here in the pull request that adds or changes the rule, and is not rewritten afterwards.

## README.md

Rule 6. From the review of PR-163 (Issue-147), which found the practice of records 0008 to 0033, amending the Status line and "Where it is described", in no rule.

Rule 7. Issue-201 took the amendments out of the index, where they had made the index longer than its rules and were read whole to find one record; Issue-363 cut the index to titles (decision 0060). The test is a rule the owner accepted on 2026-11-27, from the checkup of `6df7d6e`: the checkup of `2a146cf` had found nine rows that read "Decided" where their records were amended, and this one found decision 0062's, amended by PR-394 with the index left as it was (Issue-418). Written by Issue-271, the test found one more on its first run, decision 0055's, corrected on a fact by Issue-428.

Rule 8. From the review of PR-322 (Issue-320), where decision 0054 said that a command its hook does not answer "still asks" and a session in auto mode showed otherwise.

Rule 9. From the review of PR-334 (Issue-205), whose amendment to 0028 was the record's sixth and the first with a list of its own of what was not chosen, where no rule said what an amendment is.

Rule 10. From the review of PR-358 (Issue-292), where decision 0059 said who may read a caravan's cargo only under an alternative it did not choose.

Rule 11. A candidate rule from the review of PR-387 (Issue-383), accepted by the owner on 2026-11-26: decision 0061's Status line read `Decided, not built`, which is not one of rule 4's status words, where 0058 and 0059 had written `Decided; ... Built by Issue-n`.
