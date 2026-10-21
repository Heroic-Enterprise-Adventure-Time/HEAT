/**
 * The battle's events: the timeline a replay plays and the hub stores.
 *
 * Adapted from BattleScript Online, bso-game-shared/src/domain/events.ts.
 * Kept: start and end, turn start, action declared, resolved and overridden,
 * a unit going down, and the resolved effects. Left behind (decision 0030):
 * status-effect and resource-pool events, behavior swaps, interrupts and
 * presentation cues, and the per-unit "front-line-shift" moves, which are one
 * `line-collapsed` event here. New: `harvest` and `guard` effects, and the
 * `timeout` result. The outcome carries no wall-clock time.
 */

import type { Material } from "../index.js";
import type { OverrideLogEntry } from "./override.js";
import type { Line, ParticipantSnapshot, Side } from "./unit.js";

export type BattleResult = "win" | "loss" | "timeout";

export interface BattleStartEvent {
  readonly kind: "battle-start";
  readonly timestamp: number;
  readonly participants: readonly ParticipantSnapshot[];
  readonly timeLimitMs: number;
}

export interface TurnStartEvent {
  readonly kind: "turn-start";
  readonly timestamp: number;
  readonly unitId: string;
}

export interface ActionDeclaredEvent {
  readonly kind: "action-declared";
  readonly timestamp: number;
  readonly unitId: string;
  readonly abilityId: string;
  readonly targetIds: readonly string[];
  readonly resolveTimestamp: number;
}

export type ResolvedEffect =
  /** `guarding` names the ally the hit was aimed at, when a guard took it. */
  | {
      readonly kind: "damage";
      readonly targetId: string;
      readonly amount: number;
      readonly newHealth: number;
      readonly guarding?: string;
    }
  /** Work done to a resource node, and the material it yielded. */
  | {
      readonly kind: "harvest";
      readonly targetId: string;
      readonly material: Material;
      readonly amount: number;
      readonly yield: number;
      readonly newHealth: number;
    }
  | { readonly kind: "guard"; readonly targetId: string; readonly until: number }
  | { readonly kind: "move"; readonly unitId: string; readonly from: Line; readonly to: Line };

export interface ActionResolvedEvent {
  readonly kind: "action-resolved";
  readonly timestamp: number;
  readonly unitId: string;
  readonly abilityId: string;
  readonly targetIds: readonly string[];
  readonly effects: readonly ResolvedEffect[];
}

/** A force-action override was used at this turn; `abilityId` is what it forced. */
export interface ActionOverriddenEvent {
  readonly kind: "action-overridden";
  readonly timestamp: number;
  readonly unitId: string;
  readonly abilityId: string;
}

/** Health reached zero: a hero or monster fell, or a resource node is spent. */
export interface UnitDownEvent {
  readonly kind: "unit-down";
  readonly timestamp: number;
  readonly unitId: string;
}

/** A side's front line emptied and every living unit on it moved up one line. */
export interface LineCollapsedEvent {
  readonly kind: "line-collapsed";
  readonly timestamp: number;
  readonly side: Side;
  readonly moves: readonly { readonly unitId: string; readonly from: Line; readonly to: Line }[];
}

export interface BattleEndEvent {
  readonly kind: "battle-end";
  readonly timestamp: number;
  readonly result: BattleResult;
}

export type BattleEvent =
  | BattleStartEvent
  | TurnStartEvent
  | ActionDeclaredEvent
  | ActionResolvedEvent
  | ActionOverriddenEvent
  | UnitDownEvent
  | LineCollapsedEvent
  | BattleEndEvent;

/** Bumped when the events' shape changes (architecture overview, "The adventure loop"). */
export const BATTLE_TIMELINE_SCHEMA_VERSION = 1;

export interface BattleTimeline {
  readonly schemaVersion: number;
  readonly seed: string;
  readonly timeLimitMs: number;
  readonly participants: readonly ParticipantSnapshot[];
  /** Every override the battle used, in simulated-time order. */
  readonly overrideLog: readonly OverrideLogEntry[];
  readonly events: readonly BattleEvent[];
}

export interface BattleOutcome {
  readonly result: BattleResult;
  readonly endedAtMs: number;
  /** Every unit as it ended, in the order of the setup. */
  readonly units: readonly { readonly unitId: string; readonly health: number; readonly alive: boolean }[];
  /** Material yielded by every harvest, by material. */
  readonly gathered: Readonly<Partial<Record<Material, number>>>;
  readonly timeline: BattleTimeline;
}
