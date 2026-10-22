/**
 * Jobs and their stages: what an adventure runs.
 *
 * New in HEAT (architecture overview, "Engine provenance"): BattleScript
 * Online had single encounters and no outer loop. A job is an ordered list of
 * stages run on one timeline, with health and cargo carried between them
 * (game.md, "The battle"; decision 0030). The jobs themselves are in
 * content.ts.
 */

import type { MonsterType, ResourceType } from "../content.js";
import type { Reward } from "../index.js";
import type { BattleContent } from "../battle/index.js";

/**
 * One stage of a job.
 *
 * - `travel`: a fixed length in which nothing happens.
 * - `fight`: an encounter, the monsters by type and count, with its own time limit.
 * - `gather`: resource nodes by type and count, what the party can carry, and its own time limit.
 * - `arrive`: the job is done.
 *
 * Reaching a fight's or a gather's time limit ends the adventure as a retreat.
 */
export type Stage =
  | { readonly kind: "travel"; readonly lengthMs: number }
  | {
      readonly kind: "fight";
      readonly monsters: readonly { readonly type: MonsterType; readonly count: number }[];
      readonly timeLimitMs: number;
    }
  | {
      readonly kind: "gather";
      readonly nodes: readonly { readonly type: ResourceType; readonly count: number }[];
      readonly carry: number;
      readonly timeLimitMs: number;
    }
  | { readonly kind: "arrive" };

export type StageKind = Stage["kind"];

/** What a retreat keeps of a job's yield: its own penalty (game.md, "The battle"). */
export interface RetreatPenalty {
  readonly keepsPay: boolean;
  readonly keepsCargo: boolean;
  /** The share of the job's XP each surviving hero still earns. */
  readonly xpPercent: number;
}

export interface Job {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** The location whose job board posts it. */
  readonly location: string;
  readonly stages: readonly Stage[];
  /** The reward from whoever posted the job, paid on arrival. */
  readonly pay: readonly Reward[];
  /** XP to each surviving hero on arrival. */
  readonly xp: number;
  readonly retreat: RetreatPenalty;
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
