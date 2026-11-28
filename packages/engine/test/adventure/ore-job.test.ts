import { describe, expect, it } from "vitest";

import { FACILITIES, JOBS, jobsPostedBy, replay, STARTING_LOCATION } from "../../src/index.js";
import { battleStage, haul, MILLBROOK_RECRUITS, ORE, party, rewardOf, SEEDS, seeds, snapshot, villagers } from "./helpers.js";

// The mine's first job (Issue-133, decision 0031, with the hauls of decision
// 0058): posted by the mine, not the job board, and one run of it by
// villagers pays for a fighter, at its worst roll.

const ore = JOBS[ORE];
const gather = battleStage(ore, "gather");
/** What villagers bring home from the two veins: each vein's drop at mining 1. */
const VILLAGERS_ORE = haul("ore-vein", 1, 2);

describe("Ore from the hill", () => {
  it("is posted by Millbrook's mine and not by its job board", () => {
    expect(ore.facility).toBe("mine");
    expect(FACILITIES.mine.levels.length).toBeGreaterThan(0);
    expect(jobsPostedBy(STARTING_LOCATION, "mine").map((j) => j.id)).toContain(ORE);
    expect(jobsPostedBy(STARTING_LOCATION, "job-board").map((j) => j.id)).not.toContain(ORE);
  });

  it("gathers from 2 ore veins, then fights a wolf", () => {
    expect(ore.stages.map((s) => s.kind)).toEqual(["travel", "gather", "fight", "arrive"]);
    expect(gather.opponents).toEqual([{ type: "ore-vein", count: 2 }]);
    expect(ore.pay).toEqual([]);
  });

  for (const count of [1, 2]) {
    it(`is completed by ${count} villager(s) on every one of ${SEEDS} seeds, with 40 to 48 ore, 15 XP and no death`, () => {
      expect(VILLAGERS_ORE).toEqual({ min: 40, max: 48 });
      const heroes = villagers(count);
      for (const seed of seeds) {
        const { result } = replay(snapshot(ORE, heroes), seed, []);
        expect(result.outcome, seed).toBe("complete");
        expect(result.dead, seed).toEqual([]);
        expect(result.rewards.map((r) => r.material), seed).toEqual(["ore"]);
        expect(rewardOf(result, "ore"), seed).toBeGreaterThanOrEqual(VILLAGERS_ORE.min);
        expect(rewardOf(result, "ore"), seed).toBeLessThanOrEqual(VILLAGERS_ORE.max);
        expect(result.xp.every((x) => x.xp === 15), seed).toBe(true);
      }
    });
  }

  it(`is completed by a fighter with a villager on every one of ${SEEDS} seeds with no death, for the ore villagers bring: a fighter is not wasted on a resource run (decision 0058)`, () => {
    const heroes = party("fighter", "villager");
    for (const seed of seeds) {
      const { result } = replay(snapshot(ORE, heroes), seed, []);
      expect(result.outcome, seed).toBe("complete");
      expect(result.dead, seed).toEqual([]);
      expect(result.rewards, seed).toEqual(replay(snapshot(ORE, villagers(2)), seed, []).result.rewards);
    }
  });

  it(`brings a fighter alone no ore, and the XP all the same, on every one of ${SEEDS} seeds: with no carrier there is no drop`, () => {
    for (const seed of seeds) {
      const { result } = replay(snapshot(ORE, party("fighter")), seed, []);
      expect(result.outcome, seed).toBe("complete");
      expect(result.rewards, seed).toEqual([]);
      expect(result.xp, seed).toEqual([{ heroId: "fighter-1", xp: 15 }]);
    }
  });

  it("pays for a fighter in one run, at its worst roll", () => {
    const fighter = MILLBROOK_RECRUITS.find((r) => r.unitType === "fighter");
    expect(fighter?.cost).toEqual([{ material: "ore", amount: VILLAGERS_ORE.min }]);
  });
});
