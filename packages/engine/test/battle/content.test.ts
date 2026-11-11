import { uniqBy } from "es-toolkit";
import { describe, expect, it } from "vitest";

import { ABILITIES, gatherRating, MONSTER_TYPES, MONSTERS, must, RESOURCE_NODES, RESOURCE_TYPES, UNIT_PROFILES } from "../../src/index.js";

describe("The battle's content", () => {
  const profiles = [...Object.values(UNIT_PROFILES), ...Object.values(MONSTERS)];

  it("names only abilities that exist, each under its own id", () => {
    for (const profile of profiles) {
      for (const id of profile.actions) expect(Object.keys(ABILITIES)).toContain(id);
    }
    for (const [id, ability] of Object.entries(ABILITIES)) expect(ability.abilityId).toBe(id);
  });

  it("has the design's home lines and lists (game.md, \"The battle\")", () => {
    expect(UNIT_PROFILES.villager).toMatchObject({ homeLine: "near", actions: ["strike", "chop", "mine", "move-up"] });
    expect(UNIT_PROFILES.fighter).toMatchObject({ homeLine: "front", actions: ["guard", "strike"] });
    expect(MONSTERS.wolf).toMatchObject({ homeLine: "front", actions: ["bite", "move-up"] });
    expect(MONSTERS.bandit).toMatchObject({ homeLine: "near", actions: ["strike-weakest", "move-up"] });
    expect(UNIT_PROFILES.ranger).toMatchObject({ homeLine: "far", actions: ["shoot"] });
    expect(MONSTERS["goblin-rock-thrower"]).toMatchObject({ homeLine: "far", actions: ["throw-rock"] });
  });

  it("uses positive whole numbers for stats, warmups and amounts", () => {
    for (const profile of profiles) {
      const stats = profile.stats;
      expect(Number.isInteger(stats.maxHealth) && stats.maxHealth > 0).toBe(true);
      expect(Number.isInteger(stats.speed) && stats.speed > 0).toBe(true);
    }
    for (const ability of Object.values(ABILITIES)) expect(Number.isInteger(ability.warmupMs)).toBe(true);
    for (const node of Object.values(RESOURCE_NODES)) {
      for (const n of [node.health, node.difficulty, node.maxYield]) expect(Number.isInteger(n) && n > 0).toBe(true);
    }
    for (const profile of profiles) {
      for (const { rating } of profile.stats.gather) expect(Number.isInteger(rating) && rating > 0).toBe(true);
      expect(uniqBy(profile.stats.gather, (g) => g.material)).toHaveLength(profile.stats.gather.length);
    }
  });

  it("rates a villager low in every node's material, below its difficulty, and a combat unit not at all (decision 0051)", () => {
    for (const node of Object.values(RESOURCE_NODES)) {
      const rating = gatherRating(must(UNIT_PROFILES.villager, "the villager").stats, node.material);
      expect(rating).toBeGreaterThan(0);
      expect(rating).toBeLessThan(node.difficulty);
    }
    for (const profile of [must(UNIT_PROFILES.fighter, "the fighter"), must(UNIT_PROFILES.ranger, "the ranger"), ...Object.values(MONSTERS)]) expect(profile.stats.gather).toEqual([]);
  });

  it("lists every monster and resource type", () => {
    expect([...MONSTER_TYPES].sort()).toEqual(Object.keys(MONSTERS).sort());
    expect([...RESOURCE_TYPES].sort()).toEqual(Object.keys(RESOURCE_NODES).sort());
  });
});
