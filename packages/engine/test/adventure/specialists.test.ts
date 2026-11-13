import { describe, expect, it } from "vitest";

import { gatherRating, JOBS, location, must, replay, RESOURCE_NODES, STARTING_LOCATION, UNIT_PROFILES, type UnitType } from "../../src/index.js";
import { ORE, party, rewardOf, SEEDS, seeds, snapshot, STICKS, TIMBER, villagers } from "./helpers.js";

// The miner and the lumberjack (Issue-287): each meets a node's difficulty in
// its own material, so it harvests the node in full where a villager, at 2
// against 3, brings home two thirds; in the other material it rates 1 and
// brings home a third (decision 0051's formula).

/** What a lone hero of each type brings home from each gather job, on every seed. */
const HAULS: readonly { job: string; unitType: UnitType; material: "timber" | "ore"; amount: number }[] = [
  { job: STICKS, unitType: "villager", material: "timber", amount: 30 },
  { job: STICKS, unitType: "lumberjack", material: "timber", amount: 45 },
  { job: STICKS, unitType: "miner", material: "timber", amount: 15 },
  { job: TIMBER, unitType: "villager", material: "timber", amount: 60 },
  { job: TIMBER, unitType: "lumberjack", material: "timber", amount: 90 },
  { job: TIMBER, unitType: "miner", material: "timber", amount: 30 },
  { job: ORE, unitType: "villager", material: "ore", amount: 40 },
  { job: ORE, unitType: "miner", material: "ore", amount: 60 },
  { job: ORE, unitType: "lumberjack", material: "ore", amount: 20 },
];

describe("The miner and the lumberjack", () => {
  it("have a villager's body and meet the difficulty in their own material alone", () => {
    const villager = must(UNIT_PROFILES.villager, "the villager");
    for (const [unitType, own] of [["miner", "ore"], ["lumberjack", "timber"]] as const) {
      const profile = must(UNIT_PROFILES[unitType], `the ${unitType}`);
      expect(profile.homeLine).toBe(villager.homeLine);
      expect({ ...profile.stats, gather: [] }).toEqual({ ...villager.stats, gather: [] });
      for (const node of Object.values(RESOURCE_NODES)) {
        const rating = gatherRating(profile.stats, node.material);
        if (node.material === own) expect(rating).toBe(node.difficulty);
        else expect(rating).toBe(1);
      }
    }
  });

  for (const { job, unitType, material, amount } of HAULS) {
    it(`a lone ${unitType} completes "${JOBS[job as keyof typeof JOBS].name}" on every one of ${SEEDS} seeds with ${amount} ${material} and no death`, () => {
      for (const seed of seeds) {
        const { result } = replay(snapshot(job, party(unitType)), seed, []);
        expect(result.outcome, seed).toBe("complete");
        expect(result.dead, seed).toEqual([]);
        expect(rewardOf(result, material), seed).toBe(amount);
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
