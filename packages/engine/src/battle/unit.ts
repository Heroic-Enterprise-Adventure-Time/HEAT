/**
 * Units, lines and what a battle is set up with.
 *
 * Adapted from BattleScript Online, bso-game-shared/src/domain/entity.ts and
 * encounter.ts. Kept: the four lines (columns there), the unit kinds with a
 * resource kind among them, the participant snapshot. New: a unit's
 * gathering traits, and an enemy's drops and XP (decision 0058). Left behind
 * (decision 0030): the grid's rows, equipment, BattleScript's traits, skill
 * trees, behavior sets, quests and appearance. A line holds any number of
 * units, with no order within it; a unit starts on its type's home line.
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

/**
 * The gathering traits, named for the craft and not for a unit type (decision
 * 0058). The list declares the union (typescript.md, rule 18).
 */
export const GATHERING_TRAITS = ["woodcutting", "mining", "skinning"] as const;
export type GatheringTrait = (typeof GATHERING_TRAITS)[number];

/**
 * One gathering trait a unit carries, at a level, a whole number from 1. A
 * party gathers a drop by the highest level of the drop's trait among its
 * heroes standing; who hit what does not matter (decision 0058).
 */
export interface TraitLevel {
  readonly trait: GatheringTrait;
  readonly level: number;
}

export interface UnitStats {
  readonly maxHealth: number;
  /** Turns per ten seconds; the charge timer is `chargeMs(speed)`. */
  readonly speed: number;
  readonly damage: number;
  /**
   * The unit's gathering traits, one entry a trait at most and any number of
   * them; a trait with no entry is not carried. A list, as a cost is, so the
   * hub's snapshot is the engine's field for field.
   */
  readonly traits: readonly TraitLevel[];
}

/** The unit's level in a trait, 0 where its stats name none. */
export function traitLevel(stats: UnitStats, trait: GatheringTrait): number {
  return stats.traits.find((t) => t.trait === trait)?.level ?? 0;
}

/** What a drop gives at one level of its trait: how often, in whole percent, and the least and the most. */
export interface DropRow {
  readonly chancePercent: number;
  readonly min: number;
  readonly max: number;
}

/**
 * Something an enemy may drop when it goes down: a resource, the trait that
 * gathers it, and a row for each level of the trait, index 0 for level 1.
 * There is no formula between the levels: a drop that needs level 3 has no
 * chance in its first two rows (decision 0058).
 */
export interface Drop {
  readonly material: Material;
  readonly trait: GatheringTrait;
  readonly levels: readonly DropRow[];
}

/** The row a level reads: its own, the last row for a level above it, and none for a party that does not carry the trait. */
export function dropRow(drop: Drop, level: number): DropRow | undefined {
  return level < 1 ? undefined : drop.levels[Math.min(level, drop.levels.length) - 1];
}

/** A unit type's or a monster's place in a battle: home line, stats and its one action list. */
export interface CombatProfile {
  readonly homeLine: Line;
  readonly stats: UnitStats;
  /** Ability ids in priority order: the first usable one wins. */
  readonly actions: readonly string[];
}

/** What every enemy has, a monster and a resource node alike, for the party that puts it down (decision 0058). */
export interface EnemyYield {
  /** What it may drop when it goes down; none for an enemy that drops nothing. */
  readonly drops: readonly Drop[];
  /** The XP it gives each hero that survives the adventure. */
  readonly xp: number;
}

export interface MonsterProfile extends CombatProfile, EnemyYield {
  readonly name: string;
}

/**
 * A resource node: an obstacle that holds its line like a monster and never
 * acts (decision 0051). A hit does its damage to the node's health and
 * gathers nothing; what the node gives is its drops, when it goes down
 * (decision 0058).
 */
export interface ResourceNodeProfile extends EnemyYield {
  readonly name: string;
  readonly homeLine: Line;
  readonly health: number;
}

/** The static content a battle reads; `BATTLE_CONTENT` in content.ts is the game's. */
export interface BattleContent {
  readonly abilities: Readonly<Record<string, AbilityDefinition>>;
  readonly heroes: Readonly<Partial<Record<UnitType, CombatProfile>>>;
  readonly monsters: Readonly<Record<MonsterType, MonsterProfile>>;
  readonly resources: Readonly<Record<ResourceType, ResourceNodeProfile>>;
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
