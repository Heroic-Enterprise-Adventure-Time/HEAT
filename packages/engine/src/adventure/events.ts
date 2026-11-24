/**
 * The adventure's timeline and result: what a replay plays, what the hub
 * stores, and what settlement reads.
 *
 * New in HEAT. One timeline on the adventure's own clock: the adventure's
 * events, and each battle's events shifted by the time its stage started.
 */

import type { BattleEvent } from "../battle/index.js";
import type { UnlockId } from "../content.js";
import type { Reward } from "../index.js";
import type { StageKind } from "./job.js";
import type { AdventureLogEntry, PartyOrder } from "./override.js";
import type { SnapshotHero } from "./snapshot.js";

/** How a stage ended. `done` for travel and arrive; the rest are a battle's. The list declares the union (typescript.md, rule 18). */
export const STAGE_ENDINGS = ["done", "win", "loss", "timeout", "retreat"] as const;
export type StageEnding = (typeof STAGE_ENDINGS)[number];

/** `retreat` covers a retreat ordered and a time limit reached; `defeat` is the whole party down. */
export const ADVENTURE_OUTCOMES = ["complete", "retreat", "defeat"] as const;
export type AdventureOutcome = (typeof ADVENTURE_OUTCOMES)[number];

export interface AdventureStartEvent {
  readonly kind: "adventure-start";
  readonly timestamp: number;
  readonly jobId: string;
  readonly party: readonly { readonly heroId: string; readonly health: number; readonly maxHealth: number }[];
}

export interface StageStartEvent {
  readonly kind: "stage-start";
  readonly timestamp: number;
  readonly stage: number;
  readonly stageKind: StageKind;
}

/** A party order changed the selection. */
export interface OrderEvent {
  readonly kind: "order";
  readonly timestamp: number;
  readonly order: PartyOrder;
}

/** A retreat attempted during a fight: succeeded when `roll` (1 to 100) is at most `chancePercent`. */
export interface RetreatAttemptEvent {
  readonly kind: "retreat-attempt";
  readonly timestamp: number;
  readonly chancePercent: number;
  readonly roll: number;
  readonly succeeded: boolean;
}

/** A stage ended: each hero's health and everything that has dropped so far, carried into the next. */
export interface StageEndEvent {
  readonly kind: "stage-end";
  readonly timestamp: number;
  readonly stage: number;
  readonly ended: StageEnding;
  readonly health: readonly { readonly heroId: string; readonly health: number }[];
  readonly drops: readonly Reward[];
}

export interface AdventureEndEvent {
  readonly kind: "adventure-end";
  readonly timestamp: number;
  readonly outcome: AdventureOutcome;
}

export type AdventureEvent =
  | AdventureStartEvent
  | StageStartEvent
  | OrderEvent
  | RetreatAttemptEvent
  | StageEndEvent
  | AdventureEndEvent
  | BattleEvent;

/**
 * Bumped when the events' shape or meaning changes; a stored timeline of
 * another version is not played, "replay unavailable", and none is migrated
 * (docs/architecture/adventure-loop.md). 2: the battle's version 2, and the
 * party's stats carry gather ratings (decision 0051). 3: the battle's version
 * 3, the party's stats carry gathering traits in the ratings' place, and a
 * stage's end says what has dropped, `drops`, where it said `cargo` (decision
 * 0058).
 */
export const ADVENTURE_TIMELINE_SCHEMA_VERSION = 3;

/** Whether a stored timeline's events are this engine's, so that a client built with it can play them. */
export function isPlayableTimeline(timeline: { readonly schemaVersion?: unknown }): boolean {
  return timeline.schemaVersion === ADVENTURE_TIMELINE_SCHEMA_VERSION;
}

export interface AdventureTimeline {
  readonly schemaVersion: number;
  /** The version that issued the adventure, from the snapshot. */
  readonly version: string;
  readonly seed: string;
  readonly jobId: string;
  readonly party: readonly SnapshotHero[];
  /** Every override and order the adventure used, in simulated-time order. */
  readonly overrideLog: readonly AdventureLogEntry[];
  readonly events: readonly AdventureEvent[];
}

export interface StageResult {
  readonly stage: number;
  readonly kind: StageKind;
  readonly ended: StageEnding;
  readonly startedAtMs: number;
  readonly endedAtMs: number;
}

export interface AdventureResult {
  readonly outcome: AdventureOutcome;
  readonly endedAtMs: number;
  /** Every stage the party entered, in order. */
  readonly stages: readonly StageResult[];
  /** How far the party got: the index of the last stage it entered. */
  readonly reachedStage: number;
  /** What dropped, and on arrival the job's pay; a retreat keeps the drops alone, and a defeat nothing (decision 0058). */
  readonly rewards: readonly Reward[];
  /**
   * XP to each surviving hero, in the snapshot's order: the XP of every enemy
   * that went down, in full to each, and on arrival the job's bonus. A
   * retreat keeps the enemies' XP; on a defeat nobody survives.
   */
  readonly xp: readonly { readonly heroId: string; readonly xp: number }[];
  /** The heroes at zero health at the end. */
  readonly dead: readonly string[];
  /** Every hero's health at the end, in the snapshot's order. */
  readonly health: readonly { readonly heroId: string; readonly health: number }[];
  /**
   * The unlocks the run earned: its job's grants on arrival, and none on a
   * retreat or a defeat. What the run did, whether or not the player held
   * them already; the hub writes whatever the list holds (decision 0059).
   */
  readonly unlocks: readonly UnlockId[];
}
