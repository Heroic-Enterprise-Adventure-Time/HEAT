import { mapValues, uniqBy, zip } from "es-toolkit";
import { describe, expect, it } from "vitest";

import { ABILITIES, GATHERING_TRAITS, MATERIALS, MONSTER_TYPES, MONSTERS, must, RESOURCE_NODES, RESOURCE_TYPES, UNIT_PROFILES } from "../../src/index.js";

describe("The battle's content", () => {
  const profiles = [...Object.values(UNIT_PROFILES), ...Object.values(MONSTERS)];
  const enemies = [...Object.values(MONSTERS), ...Object.values(RESOURCE_NODES)];

  it("names only abilities that exist, each under its own id", () => {
    for (const profile of profiles) {
      for (const id of profile.actions) expect(Object.keys(ABILITIES)).toContain(id);
    }
    for (const [id, ability] of Object.entries(ABILITIES)) expect(ability.abilityId).toBe(id);
  });

  it("has the design's home lines and lists (battle.md)", () => {
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
    for (const node of Object.values(RESOURCE_NODES)) expect(Number.isInteger(node.health) && node.health > 0).toBe(true);
    for (const profile of profiles) {
      for (const { level } of profile.stats.traits) expect(Number.isInteger(level) && level > 0).toBe(true);
      expect(uniqBy(profile.stats.traits, (t) => t.trait)).toHaveLength(profile.stats.traits.length);
    }
  });

  it("gives every enemy whole XP, and every drop a known trait and rows that never shrink with the level", () => {
    for (const enemy of enemies) {
      expect(Number.isInteger(enemy.xp) && enemy.xp > 0, enemy.name).toBe(true);
      for (const drop of enemy.drops) {
        expect(GATHERING_TRAITS, enemy.name).toContain(drop.trait);
        expect(MATERIALS, enemy.name).toContain(drop.material);
        expect(drop.levels.length, enemy.name).toBeGreaterThan(0);
        for (const row of drop.levels) {
          for (const n of [row.chancePercent, row.min, row.max]) expect(Number.isInteger(n) && n >= 0, enemy.name).toBe(true);
          expect(row.chancePercent, enemy.name).toBeLessThanOrEqual(100);
          expect(row.min, enemy.name).toBeLessThanOrEqual(row.max);
        }
        // A higher level is never worse: its chance, its least and its most are each at least the level's below.
        for (const [lower, higher] of zip(drop.levels.slice(0, -1), drop.levels.slice(1))) {
          expect([higher.chancePercent >= lower.chancePercent, higher.min >= lower.min, higher.max >= lower.max], enemy.name).toEqual([true, true, true]);
        }
      }
    }
  });

  it("has the first traits: the villager cuts wood and mines at level 1 and cannot skin, a specialist carries its own trait alone at level 2, the ranger skins at level 1, and the fighter and a monster carry none (decision 0058, Issue-340)", () => {
    expect(must(UNIT_PROFILES.villager, "the villager").stats.traits).toEqual([{ trait: "woodcutting", level: 1 }, { trait: "mining", level: 1 }]);
    expect(must(UNIT_PROFILES.lumberjack, "the lumberjack").stats.traits).toEqual([{ trait: "woodcutting", level: 2 }]);
    expect(must(UNIT_PROFILES.miner, "the miner").stats.traits).toEqual([{ trait: "mining", level: 2 }]);
    expect(must(UNIT_PROFILES.ranger, "the ranger").stats.traits).toEqual([{ trait: "skinning", level: 1 }]);
    for (const profile of [must(UNIT_PROFILES.fighter, "the fighter"), ...Object.values(MONSTERS)]) expect(profile.stats.traits).toEqual([]);
    // Hide is the first drop a party gets nothing of without its carrier: the ranger is the only one.
    const skinners = Object.entries(UNIT_PROFILES).filter(([, profile]) => profile.stats.traits.some((t) => t.trait === "skinning")).map(([type]) => type);
    expect(skinners).toEqual(["ranger"]);
  });

  it("has the first drops and XP (decision 0058): a tree's timber by woodcutting, a vein's ore by mining, each always, and a wolf's hide by skinning, one half the time and one or two always at level 2 (Issue-340)", () => {
    expect(RESOURCE_NODES.tree).toMatchObject({ xp: 3, drops: [{ material: "timber", trait: "woodcutting", levels: [{ chancePercent: 100, min: 30, max: 36 }, { chancePercent: 100, min: 42, max: 50 }] }] });
    expect(RESOURCE_NODES["ore-vein"]).toMatchObject({ xp: 3, drops: [{ material: "ore", trait: "mining", levels: [{ chancePercent: 100, min: 20, max: 24 }, { chancePercent: 100, min: 28, max: 32 }] }] });
    const hide = { material: "hide", trait: "skinning", levels: [{ chancePercent: 50, min: 1, max: 1 }, { chancePercent: 100, min: 1, max: 2 }] };
    expect(mapValues(MONSTERS, (m) => [m.xp, m.drops])).toEqual({ wolf: [5, [hide]], bandit: [6, []], "goblin-rock-thrower": [5, []] });
  });

  it("aims chop at the nodes woodcutting gathers from and mine at the nodes mining does", () => {
    expect(ABILITIES.chop.effect).toEqual({ kind: "gather", trait: "woodcutting" });
    expect(ABILITIES.mine.effect).toEqual({ kind: "gather", trait: "mining" });
  });

  it("lists every monster and resource type", () => {
    expect([...MONSTER_TYPES].sort()).toEqual(Object.keys(MONSTERS).sort());
    expect([...RESOURCE_TYPES].sort()).toEqual(Object.keys(RESOURCE_NODES).sort());
  });
});
