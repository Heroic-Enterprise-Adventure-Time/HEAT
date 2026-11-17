import type { AdventureOutcome, StageEnding } from '@heat/engine';

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

/** Each stage of a result in words, "fight: won". */
export function stageResultWords(stages: readonly { readonly stage: number; readonly kind: string; readonly ended: string }[]) {
  return stages.map((s) => ({ stage: s.stage, words: `${s.kind}: ${endingWords(s.ended)}` }));
}
