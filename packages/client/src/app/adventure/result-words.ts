import { type AdventureOutcome, isUnlockId, type StageEnding, UNLOCKS } from '@heat/engine';

/** How a stage ended, in the player's words: one for each of the engine's endings, so a new ending is a compile error here (angular.md, rule 6). */
const ENDINGS: Readonly<Record<StageEnding, string>> = {
  done: 'done',
  win: 'won',
  loss: 'lost',
  timeout: 'time ran out',
  retreat: 'turned back',
};

/** How an adventure ended, in the player's words, on its result and in every list of replays. */
const OUTCOMES: Readonly<Record<AdventureOutcome, string>> = {
  complete: 'Job done',
  retreat: 'The party turned back',
  defeat: 'The party fell',
};

/** A stage's ending in the player's words; one this client's engine lacks, sent by a newer deploy, as the hub put it (angular.md, rule 6). */
export function endingWords(ended: string): string {
  return Object.hasOwn(ENDINGS, ended) ? ENDINGS[ended as StageEnding] : ended;
}

/** An adventure's outcome in words, "Job done"; one this client's engine lacks, as the hub put it (angular.md, rule 6). */
export function outcomeWords(outcome: string): string {
  return Object.hasOwn(OUTCOMES, outcome) ? OUTCOMES[outcome as AdventureOutcome] : outcome;
}

/**
 * What the player is told for each unlock a run earned that they did not
 * hold, in the content's words (game.md, "Unlocks"). Each unlock the player
 * holds names the adventure that first earned it, and settlement writes that
 * name only for an unlock the adventure's result lists and the player did
 * not hold, so the unlocks that were new with this run are exactly the
 * player's own that name this adventure (decision 0059, the owner,
 * 2026-11-24). The result's own list, which says what the run earned whether
 * or not it was new, is not read: the submit is the one operation that also
 * goes to the previous deploy, which cannot answer a field newer than it
 * (angular.md, rule 19). An unlock this client's content does not know, sent
 * by a newer deploy, has no words here and is left out, as the hub leaves it
 * out.
 */
export function earnedWords(held: readonly { readonly unlock: string; readonly adventureId: string }[], adventureId: string): string[] {
  return held.flatMap((h) => (h.adventureId === adventureId && isUnlockId(h.unlock) ? [UNLOCKS[h.unlock].earned] : []));
}

/** Each stage of a result in words, "fight: won". */
export function stageResultWords(stages: readonly { readonly stage: number; readonly kind: string; readonly ended: string }[]) {
  return stages.map((s) => ({ stage: s.stage, words: `${s.kind}: ${endingWords(s.ended)}` }));
}
