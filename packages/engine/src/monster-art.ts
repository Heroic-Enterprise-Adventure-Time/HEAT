import type { MonsterType, ResourceType } from "./content.js";

/**
 * The sprite sets of the battle's monsters and resources, by the set's
 * directory under art/monsters/ and art/props/. The test checks these against
 * every set's provenance.json, `monsters` or `props`, so a new set is added
 * here and there together. A resource with no art yet, such as the ore vein,
 * has no entry.
 */
export const MONSTER_SPRITE_SETS: Readonly<Record<MonsterType, readonly string[]>> = {
  wolf: ["wolf-02"],
  bandit: ["bandit-01"],
};

export const PROP_SPRITE_SETS: Readonly<Partial<Record<ResourceType, readonly string[]>>> = {
  tree: ["tree-01"],
};
