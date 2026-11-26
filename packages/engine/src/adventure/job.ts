/**
 * Jobs and their stages: what an adventure runs.
 *
 * New in HEAT (architecture overview, "Engine provenance"): BattleScript
 * Online had single encounters and no outer loop. A job is an ordered list of
 * stages run on one timeline, with health, what dropped and the enemies' XP
 * carried between them (battle.md; decisions 0030 and 0058). The
 * jobs themselves are in content.ts.
 */

import type { BattleContent } from "../battle/index.js";
import type { FacilityKind, MonsterType, ResourceType, UnlockId } from "../content.js";
import type { Reward } from "../index.js";

/** A least and a most, both whole numbers from 1, for a count rolled from the adventure's seed. */
export interface CountRange {
  readonly min: number;
  readonly max: number;
}

/**
 * One entry of a fight or a gather stage as the content writes it: a type,
 * how many of it, and how often it appears at all (decision 0058). The count
 * is one number, or a range the adventure's seed rolls within; an entry with
 * no chance always appears. So a job's adventures have the same stages and
 * about the same enemies, and are not the same. `expandStages` (expand.ts)
 * makes the roll, and what it gives is a `StageOpponents`.
 */
export interface StageEntry {
  readonly type: MonsterType | ResourceType;
  readonly count: number | CountRange;
  /** How often the entry appears, in whole percent from 1 to 99; one that always appears states none. */
  readonly chancePercent?: number;
}

/** One entry of a stage as an adventure meets it, the roll made: a type and how many. */
export interface StageOpponents {
  readonly type: MonsterType | ResourceType;
  readonly count: number;
}

/**
 * One stage of a job, by what its fight or gather lists.
 *
 * - `travel`: a fixed length in which nothing happens.
 * - `fight` and `gather`: what stands on the other side, monsters and
 *   resource nodes together, with its own time limit. The stage ends when all
 *   of it is down. The two kinds run alike; the kind is how the stage reads,
 *   a fight where the job is the monsters and a gather where it is the nodes
 *   (decision 0051).
 * - `arrive`: the job is done.
 *
 * Reaching a fight's or a gather's time limit ends the adventure as a retreat.
 */
type StageOf<Entry> =
  | { readonly kind: "travel"; readonly lengthMs: number }
  | {
      readonly kind: "fight" | "gather";
      readonly opponents: readonly Entry[];
      readonly timeLimitMs: number;
    }
  | { readonly kind: "arrive" };

/** A stage as a job's content writes it: its entries may vary. */
export type Stage = StageOf<StageEntry>;

/** A stage as one adventure runs it, expanded from its seed: every entry a type and a count. */
export type ExpandedStage = StageOf<StageOpponents>;

export type StageKind = Stage["kind"];

export const STAGE_KINDS = ["travel", "fight", "gather", "arrive"] as const satisfies readonly StageKind[];
// Every kind of Stage is in the list: a stage added to the union without its kind here fails here (typescript.md, rule 18).
const _everyStageKindListed: [Exclude<StageKind, (typeof STAGE_KINDS)[number]>] extends [never] ? true : never = true;

/**
 * A job. What a retreat keeps is one rule for every job, the drops and the
 * enemies' XP and neither the pay nor the bonus, so a job states no penalty
 * of its own, a caravan included: its cargo is not a drop, and what a
 * retreat does to it is the hub's (decisions 0058 and 0059).
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
  /**
   * The level of its facility that the camp must have to start it, where a
   * level posts a job of its own (Issue-357); a job without one needs level 1.
   */
  readonly facilityLevel?: number;
  /** The stages as written; an adventure runs `expandStages(job, seed)`, never these. */
  readonly stages: readonly Stage[];
  /** The reward from whoever posted the job, paid on arrival. */
  readonly pay: readonly Reward[];
  /** XP to each surviving hero on arrival, on top of the XP of the enemies that went down. */
  readonly bonusXp: number;
  /** The unlocks the job grants on arrival, and not on a retreat or a defeat; most jobs grant none (decision 0059). */
  readonly grants?: readonly UnlockId[];
  /**
   * The location a caravan delivers to, by its id; a job with one is a
   * caravan, and its party has a cart beside its heroes in every fight and
   * gather stage. What the cart carries is the hub's (decision 0059).
   */
  readonly deliversTo?: string;
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
