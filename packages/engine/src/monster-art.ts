/**
 * The sprite sets of the battle's monsters and props, by the set's directory
 * under art/monsters/ and art/props/. The test checks these against every
 * set's provenance.json, `monsters` or `props`, so a new set is added here and
 * there together. The keys are the battle's monster and resource types,
 * declared with the battle's content.
 */
export const MONSTER_SPRITE_SETS: Readonly<Record<string, readonly string[]>> = {
  wolf: ["wolf-02"],
  bandit: ["bandit-01"],
};

export const PROP_SPRITE_SETS: Readonly<Record<string, readonly string[]>> = {
  tree: ["tree-01"],
};
