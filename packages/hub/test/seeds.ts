import { range } from "es-toolkit";

import { ADVENTURE_CONTENT, type AdventureContent, type AdventureResult, type AdventureSnapshot, must, replay, UNIT_PROFILES, type UnitType } from "@heat/engine";

import { VERSION as version } from "./versions.js";

/**
 * A stand-in party's snapshot of a job: hero i is `stand-in-<i>`, of the i-th
 * unit type, at level 1. A roll does not read who the heroes are, so a
 * stand-in party of the same types, in the same order, says what the
 * player's will do (graphql.md, rule 26).
 */
export function standIn(jobId: string, unitTypes: readonly UnitType[]): AdventureSnapshot {
  return {
    version,
    jobId,
    heroes: unitTypes.map((unitType, i) => ({ heroId: `stand-in-${i}`, unitType, name: unitType, spriteSet: `${unitType}-01`, level: 1, stats: must(UNIT_PROFILES[unitType], `the ${unitType}'s profile`).stats })),
  };
}

/**
 * A seed on which a party of these unit types ends the job as `ends` says,
 * found by asking the engine to replay the stand-in party on `<job>-0` to
 * `<job>-499`, with the content given or the engine's own.
 */
export function seedWhere(jobId: string, unitTypes: readonly UnitType[], ends: (result: AdventureResult) => boolean, content: AdventureContent = ADVENTURE_CONTENT): string {
  const snapshot = standIn(jobId, unitTypes);
  return must(range(500).map((i) => `${jobId}-${i}`).find((seed) => ends(replay(snapshot, seed, [], content).result)), `a seed on which ${unitTypes.join(" and ")} end so on ${jobId}`);
}
