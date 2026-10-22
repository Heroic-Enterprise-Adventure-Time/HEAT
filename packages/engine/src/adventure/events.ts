/**
 * The adventure's timeline and result: what a replay plays, what the hub
 * stores, and what settlement reads.
 *
 * New in HEAT. One timeline on the adventure's own clock: the adventure's
 * events, and each battle's events shifted by the time its stage started.
 */

import type { Reward } from "../index.js";
import type { BattleEvent } from "../battle/index.js";
import type { StageKind } from "./job.js";
import type { AdventureLogEntry, PartyOrder } from "./override.js";
import type { SnapshotHero } from "./snapshot.js";

/** How a stage ended. `done` for travel and arrive; the rest are a battle's. */
export type StageEnding = "done" | "win" | "loss" | "timeout" | "retreat";

/** `retreat` covers a retreat ordered and a time limit reached; `defeat` is the whole party down. */
export type AdventureOutcome = "complete" | "retreat" | "defeat";

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

/** A stage ended: each hero's health and the cargo so far, carried into the next. */
export interface StageEndEvent {
  readonly kind: "stage-end";
  readonly timestamp: number;
  readonly stage: number;
  readonly ended: StageEnding;
  readonly health: readonly { readonly heroId: string; readonly health: number }[];
  readonly cargo: readonly Reward[];
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

/** Bumped when the events' shape changes (architecture overview, "The adventure loop"). */
export const ADVENTURE_TIMELINE_SCHEMA_VERSION = 1;

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
  /** The job's pay and the cargo, after the retreat penalty; nothing on a defeat. */
  readonly rewards: readonly Reward[];
  /** XP to each surviving hero, in the snapshot's order. */
  readonly xp: readonly { readonly heroId: string; readonly xp: number }[];
  /** The heroes at zero health at the end. */
  readonly dead: readonly string[];
  /** Every hero's health at the end, in the snapshot's order. */
  readonly health: readonly { readonly heroId: string; readonly health: number }[];
}
