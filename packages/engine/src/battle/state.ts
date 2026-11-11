/**
 * The battle's mutable state, internal to the engine and its resolution.
 *
 * Adapted from BattleScript Online, bso-game-shared/src/combat/state.ts.
 * Kept: the declared action in warmup, the per-unit state with its charge
 * timer, the action context and the selection. Left behind (decision 0030):
 * status effects, resource pools and per-ability cooldowns. New: the guard a
 * unit holds, and the unit's own stats and action list.
 */

import type { AbilityDefinition } from "./ability.js";
import type { Line, ResourceNodeProfile, Side, UnitKind, UnitStats } from "./unit.js";

/** A declared action in its warmup. */
export interface DeclaredAction {
  readonly abilityId: string;
  readonly targetIds: readonly string[];
  readonly resolvesAt: number;
}

/** A guard the unit holds: hits aimed at the ally land on it until `until`. */
export interface Guard {
  readonly allyId: string;
  readonly until: number;
}

export interface UnitState {
  readonly unitId: string;
  readonly kind: UnitKind;
  readonly type: string;
  readonly side: Side;
  readonly stats: UnitStats;
  /** The unit's action list, resolved to abilities, in priority order. */
  readonly actions: readonly AbilityDefinition[];
  /** A resource node's profile; absent on every other unit. */
  readonly node?: ResourceNodeProfile;
  /** What a node's hits have earned toward its yield (`harvested`); 0 on every other unit. */
  credit: number;
  /** False for a unit that never takes a turn, a resource node. */
  readonly acts: boolean;
  health: number;
  line: Line;
  /** Milliseconds until the unit's next turn, or until its declared action resolves. */
  chargeTimer: number;
  currentAction: DeclaredAction | null;
  guard: Guard | null;
  alive: boolean;
}

/** What action selection sees: the actor, its side and the other side, and the clock. */
export interface ActionContext {
  readonly actor: UnitState;
  readonly allies: readonly UnitState[];
  readonly opponents: readonly UnitState[];
  readonly clock: number;
}

/** The chosen ability and its target. */
export interface ActionSelection {
  readonly ability: AbilityDefinition;
  readonly target: UnitState;
}
