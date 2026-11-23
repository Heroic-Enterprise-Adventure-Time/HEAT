import { describe, expect, it } from "vitest";

import { type JobId, JOBS, location, type Material, must, replay, type ResourceType, STARTING_LOCATION, UNIT_PROFILES, type UnitType } from "../../src/index.js";
import { GOBLINS, haul, ORE, party, rewardOf, SEEDS, seeds, snapshot, STICKS, TIMBER, villagers } from "./helpers.js";

// The miner and the lumberjack (Issue-287, as decision 0058 has them): each
// carries its own trait alone, at level 2, where a villager carries both at
// level 1. So a specialist's own node drops by its second row, and a node of
// the other kind drops it nothing.

/** What a lone hero of each type brings home from each gather job: the nodes, and the level of their trait it carries, 0 for none. */
const HAULS: readonly { job: JobId; unitType: UnitType; material: Material; node: ResourceType; count: number; level: number }[] = [
  { job: STICKS, unitType: "villager", material: "timber", node: "tree", count: 1, level: 1 },
  { job: STICKS, unitType: "lumberjack", material: "timber", node: "tree", count: 1, level: 2 },
  { job: STICKS, unitType: "miner", material: "timber", node: "tree", count: 1, level: 0 },
  { job: TIMBER, unitType: "villager", material: "timber", node: "tree", count: 2, level: 1 },
  { job: TIMBER, unitType: "lumberjack", material: "timber", node: "tree", count: 2, level: 2 },
  { job: TIMBER, unitType: "miner", material: "timber", node: "tree", count: 2, level: 0 },
  { job: ORE, unitType: "villager", material: "ore", node: "ore-vein", count: 2, level: 1 },
  { job: ORE, unitType: "miner", material: "ore", node: "ore-vein", count: 2, level: 2 },
  { job: ORE, unitType: "lumberjack", material: "ore", node: "ore-vein", count: 2, level: 0 },
];

describe("The miner and the lumberjack", () => {
  it("have a villager's body and carry their own trait alone, at level 2", () => {
    const villager = must(UNIT_PROFILES.villager, "the villager");
    for (const [unitType, own] of [["miner", "mining"], ["lumberjack", "woodcutting"]] as const) {
      const profile = must(UNIT_PROFILES[unitType], `the ${unitType}`);
      expect(profile.homeLine).toBe(villager.homeLine);
      expect({ ...profile.stats, traits: [] }).toEqual({ ...villager.stats, traits: [] });
      expect(profile.stats.traits).toEqual([{ trait: own, level: 2 }]);
    }
  });

  it("bring home at level 2 what the first numbers say: 84 to 100 timber from the timber job, 56 to 64 ore from the ore job", () => {
    expect(haul("tree", 2, 2)).toEqual({ min: 84, max: 100 });
    expect(haul("ore-vein", 2, 2)).toEqual({ min: 56, max: 64 });
  });

  for (const { job, unitType, material, node, count, level } of HAULS) {
    const range = level > 0 ? haul(node, level, count) : { min: 0, max: 0 };
    const words = level > 0 ? `${range.min} to ${range.max} ${material}` : `no ${material}, which it cannot gather`;
    it(`a lone ${unitType} completes "${JOBS[job].name}" on every one of ${SEEDS} seeds with ${words} and no death`, () => {
      for (const seed of seeds) {
        const { result } = replay(snapshot(job, party(unitType)), seed, []);
        expect(result.outcome, seed).toBe("complete");
        expect(result.dead, seed).toEqual([]);
        expect(rewardOf(result, material), seed).toBeGreaterThanOrEqual(range.min);
        expect(rewardOf(result, material), seed).toBeLessThanOrEqual(range.max);
      }
    });
  }

  it(`with a villager, each brings home more of its material than two villagers, on every one of ${SEEDS} seeds`, () => {
    for (const [unitType, job, material] of [["lumberjack", TIMBER, "timber"], ["miner", ORE, "ore"]] as const) {
      for (const seed of seeds) {
        const pair = rewardOf(replay(snapshot(job, party(unitType, "villager")), seed, []).result, material);
        const two = rewardOf(replay(snapshot(job, villagers(2)), seed, []).result, material);
        expect(pair, `${unitType} ${seed}`).toBeGreaterThan(two);
      }
    }
  });

  // On the mixed stage of "Goblins in the old workings" a specialist digs
  // before it strikes, its own material first in its list. That costs nothing
  // there: the goblins stand behind the veins, out of a melee hero's reach
  // until the veins fall, so a villager has nothing to strike either. With a
  // monster in reach beside a node a specialist strikes it first, as a
  // villager does (Issue-341; first-job.test.ts plays that). Put in a
  // villager's place, a specialist is defeated where a villager is, and
  // completes where a villager does, with no more deaths (the review of PR-304).
  it(`on the goblins job, a specialist in a villager's place loses where villagers lose and wins where they win, on every one of ${SEEDS} seeds`, () => {
    for (const seed of seeds) {
      for (const types of [["miner"], ["lumberjack"], ["miner", "villager"], ["lumberjack", "villager"]] as const) {
        expect(replay(snapshot(GOBLINS, party(...types)), seed, []).result.outcome, `${types.join("+")} ${seed}`).toBe("defeat");
      }
      const withVillagers = replay(snapshot(GOBLINS, party("ranger", "villager", "villager")), seed, []).result;
      const withMiner = replay(snapshot(GOBLINS, party("ranger", "miner", "villager")), seed, []).result;
      expect(withMiner.outcome, seed).toBe("complete");
      expect(withMiner.dead, seed).toEqual([]);
      expect(rewardOf(withMiner, "ore"), seed).toBeGreaterThan(rewardOf(withVillagers, "ore"));
      const fourVillagers = replay(snapshot(GOBLINS, villagers(4)), seed, []).result;
      const minerAndThree = replay(snapshot(GOBLINS, party("miner", "villager", "villager", "villager")), seed, []).result;
      expect(minerAndThree.outcome, seed).toBe("complete");
      expect(minerAndThree.dead.length, seed).toBeLessThanOrEqual(fourVillagers.dead.length);
      expect(rewardOf(minerAndThree, "ore"), seed).toBeGreaterThanOrEqual(rewardOf(fourVillagers, "ore"));
    }
  });

  it("are recruited at Millbrook at hall level 1: the lumberjack for 40 timber, the miner for 30 ore and 20 timber", () => {
    const recruits = must(location(STARTING_LOCATION), "Millbrook").recruits;
    expect(recruits.find((r) => r.unitType === "lumberjack")).toEqual({ unitType: "lumberjack", hallLevel: 1, cost: [{ material: "timber", amount: 40 }] });
    expect(recruits.find((r) => r.unitType === "miner")).toEqual({
      unitType: "miner",
      hallLevel: 1,
      cost: [{ material: "ore", amount: 30 }, { material: "timber", amount: 20 }],
    });
  });
});
