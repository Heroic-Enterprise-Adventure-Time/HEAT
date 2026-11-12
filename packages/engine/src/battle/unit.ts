/**
 * Units, lines and what a battle is set up with.
 *
 * Adapted from BattleScript Online, bso-game-shared/src/domain/entity.ts and
 * encounter.ts. Kept: the four lines (columns there), the unit kinds with a
 * resource kind among them, the participant snapshot. New: a node's
 * difficulty and maximum yield, and a unit's gather ratings. Left behind (decision
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

/**
 * A unit's gather rating for one material: how well it harvests a node of
 * it. A hit's yield is by the rating against the node's difficulty, whatever
 * the ability (decision 0051).
 */
export interface GatherRating {
  readonly material: Material;
  readonly rating: number;
}

/** A unit's ratings, one entry a material at most; a material with no entry is 0. A list, as a cost is, so the hub's snapshot is the engine's field for field. */
export type GatherRatings = readonly GatherRating[];

export interface UnitStats {
  readonly maxHealth: number;
  /** Turns per ten seconds; the charge timer is `chargeMs(speed)`. */
  readonly speed: number;
  readonly damage: number;
  readonly gather: GatherRatings;
}

/** The unit's gather rating for a material, 0 where its stats name none. */
export function gatherRating(stats: UnitStats, material: Material): number {
  return stats.gather.find((g) => g.material === material)?.rating ?? 0;
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

/**
 * A resource node: an obstacle that holds its line like a monster and never
 * acts. Every hit does its damage to the node's health; what the party
 * harvests is by `harvested` (decision 0051).
 */
export interface ResourceNodeProfile {
  readonly name: string;
  readonly homeLine: Line;
  readonly material: Material;
  readonly health: number;
  /** The gather rating that harvests the node in full; a lower one harvests its share, a higher one no more. */
  readonly difficulty: number;
  /** The most material the node gives, to hits that meet its difficulty all the way down. */
  readonly maxYield: number;
}

/**
 * The material harvested from a node so far, from the credit its hits have
 * earned: each hit adds the damage it did times its unit's gather rating, the
 * rating capped at the node's difficulty. Whole numbers, rounded down on the
 * running total, so hits that meet the difficulty all the way down harvest
 * exactly the maximum, and a hit with a zero rating wastes its share of the
 * node for good.
 */
export function harvested(node: ResourceNodeProfile, credit: number): number {
  return Math.floor((credit * node.maxYield) / (node.health * node.difficulty));
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
