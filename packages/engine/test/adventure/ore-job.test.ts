import { describe, expect, it } from "vitest";

import { FACILITIES, JOBS, jobsPostedBy, location, replay, STARTING_LOCATION } from "../../src/index.js";
import { ORE, party, rewardOf, SEEDS, seeds, snapshot, villagers } from "./helpers.js";

// The mine's first job (Issue-133, decision 0031, as retuned by decision
// 0051): posted by the mine, not the job board, and one run of it by
// villagers pays for a fighter.

const ore = JOBS[ORE];
const gather = ore.stages[1];
if (gather?.kind !== "gather") throw new Error("The ore job gathers second");
/** What villagers bring home from the two veins: a rating of 2 against 3, two thirds of each vein's 30. */
const VILLAGERS_ORE = 40;

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
    expect(ore.xp).toBe(15);
  });

  for (const count of [1, 2]) {
    it(`is completed by ${count} villager(s) on every one of ${SEEDS} seeds, with 40 ore and no death`, () => {
      const heroes = villagers(count);
      for (const seed of seeds) {
        const { result } = replay(snapshot(ORE, heroes), seed, []);
        expect(result.outcome, seed).toBe("complete");
        expect(result.dead, seed).toEqual([]);
        expect(result.rewards, seed).toEqual([{ material: "ore", amount: VILLAGERS_ORE }]);
        expect(result.xp.every((x) => x.xp === ore.xp), seed).toBe(true);
      }
    });
  }

  it(`is completed by a fighter with a villager on every one of ${SEEDS} seeds with no death, for less ore: the fighter's hits waste the veins`, () => {
    const heroes = party("fighter", "villager");
    for (const seed of seeds) {
      const { result } = replay(snapshot(ORE, heroes), seed, []);
      expect(result.outcome, seed).toBe("complete");
      expect(result.dead, seed).toEqual([]);
      const amount = rewardOf(result, "ore");
      expect(amount, seed).toBeGreaterThan(0);
      expect(amount, seed).toBeLessThan(VILLAGERS_ORE);
    }
  });

  it("pays for a fighter in one run", () => {
    const fighter = location(STARTING_LOCATION)?.recruits.find((r) => r.unitType === "fighter");
    expect(fighter?.cost).toEqual([{ material: "ore", amount: VILLAGERS_ORE }]);
  });
});
