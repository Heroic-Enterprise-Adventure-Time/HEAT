/**
 * Jobs and their stages: what an adventure runs.
 *
 * New in HEAT (architecture overview, "Engine provenance"): BattleScript
 * Online had single encounters and no outer loop. A job is an ordered list of
 * stages run on one timeline, with health, what dropped and the enemies' XP
 * carried between them (game.md, "The battle"; decisions 0030 and 0058). The
 * jobs themselves are in content.ts.
 */

import type { BattleContent } from "../battle/index.js";
import type { FacilityKind, MonsterType, ResourceType } from "../content.js";
import type { Reward } from "../index.js";

/**
 * One stage of a job.
 *
 * - `travel`: a fixed length in which nothing happens.
 * - `fight` and `gather`: what stands on the other side, monsters and
 *   resource nodes together, by type and count, with its own time limit. The
 *   stage ends when all of it is down. The two kinds run alike; the kind is
 *   how the stage reads, a fight where the job is the monsters and a gather
 *   where it is the nodes (decision 0051).
 * - `arrive`: the job is done.
 *
 * Reaching a fight's or a gather's time limit ends the adventure as a retreat.
 */
export interface StageOpponents {
  readonly type: MonsterType | ResourceType;
  readonly count: number;
}

export type Stage =
  | { readonly kind: "travel"; readonly lengthMs: number }
  | {
      readonly kind: "fight" | "gather";
      readonly opponents: readonly StageOpponents[];
      readonly timeLimitMs: number;
    }
  | { readonly kind: "arrive" };

export type StageKind = Stage["kind"];

export const STAGE_KINDS = ["travel", "fight", "gather", "arrive"] as const satisfies readonly StageKind[];
// Every kind of Stage is in the list: a stage added to the union without its kind here fails here (typescript.md, rule 18).
const _everyStageKindListed: [Exclude<StageKind, (typeof STAGE_KINDS)[number]>] extends [never] ? true : never = true;

/**
 * A job. What a retreat keeps is one rule for every job, the drops and the
 * enemies' XP and neither the pay nor the bonus, so a job states no penalty
 * of its own; one returns with caravans, whose cargo is not a drop (decision
 * 0058; Issue-292).
 */
export interface Job {
  readonly id: string;
  readonly name: string;
  /** What the job's author chooses to tell: the page says this, the pay and the bonus, and nothing of the stages or the drops (decision 0058). */
  readonly description: string;
  /** The location that posts it. */
  readonly location: string;
  /**
   * The own facility that posts it, which the camp must have built to start
   * it; a job with none is on the location's job board (Issue-133).
   */
  readonly facility?: FacilityKind;
  readonly stages: readonly Stage[];
  /** The reward from whoever posted the job, paid on arrival. */
  readonly pay: readonly Reward[];
  /** XP to each surviving hero on arrival, on top of the XP of the enemies that went down. */
  readonly bonusXp: number;
}

/**
 * How a retreat in a fight is attempted: every `intervalMs` from the order,
 * rolled against the seeded random number generator, the chance rising with
 * each failed attempt until it is certain.
 */
export interface RetreatRule {
  readonly intervalMs: number;
  readonly firstChancePercent: number;
  readonly risePercent: number;
}

/** The static content an adventure reads; `ADVENTURE_CONTENT` in content.ts is the game's. */
export interface AdventureContent {
  readonly battle: BattleContent;
  readonly jobs: Readonly<Record<string, Job>>;
  readonly retreat: RetreatRule;
}
