import type { AbilityId, MonsterType, UnitType } from "./content.js";

/**
 * The art of an action (game.md, "How the game looks"; Issue-130): the
 * weapon a unit shows beside it while it acts, and the effect each ability
 * draws on whatever it lands on, by the set's directory under art/weapons/
 * and art/effects/. The test checks these against every set's
 * provenance.json, `wielders` or `abilities`, so a new set is added here and
 * there together.
 *
 * A weapon goes by the unit type for now, a generic one of the kind the type
 * uses (one weapon kind per unit type, game.md, "Heroes"); when heroes carry
 * crafted weapons, the hero's own replaces this lookup. A unit with no entry,
 * such as the wolf, acts with nothing in hand. An ability with no entry, such
 * as moving up, draws no effect. An effect with a projectile, the arrow and
 * the rock, flies it from the actor to the target before its impact plays
 * (assets.md, rule 35).
 */
export const WEAPON_SPRITES: Readonly<Partial<Record<UnitType | MonsterType, string>>> = {
  villager: "hand-axe-01",
  miner: "pickaxe-01",
  lumberjack: "felling-axe-01",
  fighter: "sword-01",
  bandit: "dagger-01",
  ranger: "bow-01",
};

export const ABILITY_EFFECTS: Readonly<Partial<Record<AbilityId, string>>> = {
  strike: "slash-01",
  "strike-weakest": "slash-01",
  bite: "bite-01",
  guard: "guard-01",
  chop: "chop-01",
  mine: "mine-01",
  shoot: "arrow-01",
  "throw-rock": "rock-01",
};
