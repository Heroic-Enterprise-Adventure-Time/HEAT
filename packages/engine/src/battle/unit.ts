/**
 * Units, lines and what a battle is set up with.
 *
 * Adapted from BattleScript Online, bso-game-shared/src/domain/entity.ts and
 * encounter.ts. Kept: the four lines (columns there), the unit kinds with a
 * resource kind among them, the participant snapshot. Left behind (decision
 * 0030): the grid's rows, equipment, traits, skill trees, behavior sets,
 * quests and appearance. A line holds any number of units, with no order
 * within it; a unit starts on its type's home line.
 */

import type { Material, MonsterType, ResourceType, UnitType } from "../index.js";
import type { AbilityDefinition } from "./ability.js";

/** A side's lines, nearest the other side first. */
export type Line = "front" | "near" | "far" | "back";

export const LINES: readonly Line[] = ["front", "near", "far", "back"];

/** 0 for the front line, 3 for the back. */
export function lineIndex(line: Line): number {
  return LINES.indexOf(line);
}

/** The line one step nearer the other side, or undefined from the front. */
export function lineAhead(line: Line): Line | undefined {
  const i = lineIndex(line);
  return i > 0 ? LINES[i - 1] : undefined;
}

export type Side = "party" | "opponents";

export type UnitKind = "hero" | "monster" | "resource";

export interface UnitStats {
  readonly maxHealth: number;
  /** Turns per ten seconds; the charge timer is `chargeMs(speed)`. */
  readonly speed: number;
  readonly damage: number;
  /** Work done to a resource node by a gather ability. */
  readonly gathering: number;
}

/** A unit type's or a monster's place in a battle: home line, stats and its one action list. */
export interface CombatProfile {
  readonly homeLine: Line;
  readonly stats: UnitStats;
  /** Ability ids in priority order: the first usable one wins. */
  readonly actions: readonly string[];
}

export interface MonsterProfile extends CombatProfile {
  readonly name: string;
}

/** A resource node: health is the material it holds, and it never acts. */
export interface ResourceNodeProfile {
  readonly name: string;
  readonly homeLine: Line;
  readonly material: Material;
  readonly amount: number;
}

/** How a regular attack fares against a resource node: poor work, poor yield. */
export interface ResourceHit {
  /** The share of the actor's damage done as work to the node. */
  readonly workPercent: number;
  /** The share of that work that becomes material. */
  readonly yieldPercent: number;
}

/** The static content a battle reads; `BATTLE_CONTENT` in content.ts is the game's. */
export interface BattleContent {
  readonly abilities: Readonly<Record<string, AbilityDefinition>>;
  readonly heroes: Readonly<Partial<Record<UnitType, CombatProfile>>>;
  readonly monsters: Readonly<Record<MonsterType, MonsterProfile>>;
  readonly resources: Readonly<Record<ResourceType, ResourceNodeProfile>>;
  readonly resourceHit: ResourceHit;
}

/** A hero as the snapshot gives it: effective stats and the health it has now. */
export interface PartyMember {
  readonly unitId: string;
  readonly unitType: UnitType;
  /** Current health, carried over between stages; at most `stats.maxHealth`. */
  readonly health: number;
  readonly stats: UnitStats;
}

/** A monster or a resource node, by its type in the content. */
export interface Opponent {
  readonly unitId: string;
  readonly type: MonsterType | ResourceType;
}

export interface BattleSetup {
  readonly seed: string;
  readonly party: readonly PartyMember[];
  readonly opponents: readonly Opponent[];
  /** The fight's time limit on its own clock; reaching it ends the battle as `timeout`. */
  readonly timeLimitMs: number;
  /**
   * What the party can carry: material yielded beyond it is left behind, and
   * reaching it ends the battle as a win, the party loaded. Absent, a battle
   * yields whatever is harvested.
   */
  readonly carryLimit?: number;
}

/** A unit as it stood at the start, for the timeline. */
export interface ParticipantSnapshot {
  readonly unitId: string;
  readonly kind: UnitKind;
  /** The unit type, monster type or resource type. */
  readonly type: string;
  readonly side: Side;
  readonly line: Line;
  readonly health: number;
  readonly maxHealth: number;
}
