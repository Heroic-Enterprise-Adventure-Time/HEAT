import { describe, expect, it } from "vitest";

import { type AdventureResult, JOBS, jobsPostedBy, location, replay, STARTING_LOCATION, WAREHOUSE_CAPACITY } from "../../src/index.js";
import { GOBLINS, haul, ORE, party, played, rewardOf, SEEDS, seeds, snapshot, villagers } from "./helpers.js";

// The first mixed stage (Issue-286, decision 0052): three ore veins hold the
// front line and two goblin rock throwers stand behind them. Its numbers are
// checked over seeds with a ranger and without one, with the hauls of
// decision 0058.

const goblins = JOBS[GOBLINS];
const stage = goblins.stages[1];
if (stage?.kind !== "gather") throw new Error("The goblins job gathers second");
/** What a party with a villager standing brings home from the three veins: each vein's drop at mining 1. */
const VILLAGERS_ORE = haul("ore-vein", 1, 3);

const oreOf = (result: AdventureResult) => rewardOf(result, "ore");

describe("Goblins in the old workings", () => {
  it("is the mine's second job: three veins with two goblins behind them, and nothing after", () => {
    expect(jobsPostedBy(STARTING_LOCATION, "mine").map((j) => j.id)).toEqual([ORE, GOBLINS]);
    expect(goblins.stages.map((s) => s.kind)).toEqual(["travel", "gather", "arrive"]);
    expect(stage.opponents).toEqual([{ type: "ore-vein", count: 3 }, { type: "goblin-rock-thrower", count: 2 }]);
    expect(goblins.pay).toEqual([]);
    // A miner's best roll fits a level-1 warehouse.
    expect(haul("ore-vein", 2, 3).max).toBeLessThanOrEqual(WAREHOUSE_CAPACITY[0] ?? 0);
  });

  for (const count of [1, 2, 3]) {
    it(`defeats ${count} villager(s) on every one of ${SEEDS} seeds`, () => {
      for (const { seed, result } of played(GOBLINS, villagers(count))) expect(result.outcome, seed).toBe("defeat");
    });
  }

  it(`is completed by four villagers on every one of ${SEEDS} seeds with 60 to 72 ore, at the cost of a villager on most`, () => {
    expect(VILLAGERS_ORE).toEqual({ min: 60, max: 72 });
    const runs = played(GOBLINS, villagers(4));
    for (const { seed, result } of runs) {
      expect(result.outcome, seed).toBe("complete");
      expect(oreOf(result), seed).toBeGreaterThanOrEqual(VILLAGERS_ORE.min);
      expect(oreOf(result), seed).toBeLessThanOrEqual(VILLAGERS_ORE.max);
    }
    expect(runs.filter((r) => r.result.dead.length > 0).length).toBeGreaterThan(SEEDS / 2);
  });

  it(`defeats a fighter with one villager on every one of ${SEEDS} seeds: neither reaches the goblins in time`, () => {
    for (const { seed, result } of played(GOBLINS, party("fighter", "villager"))) expect(result.outcome, seed).toBe("defeat");
  });

  it(`is completed by a ranger with two villagers on every one of ${SEEDS} seeds with no death, for 25 XP and all the ore villagers bring: the ranger's shots at a vein cost nothing (decision 0058)`, () => {
    for (const { seed, result } of played(GOBLINS, party("ranger", "villager", "villager"))) {
      expect(result.outcome, seed).toBe("complete");
      expect(result.dead, seed).toEqual([]);
      expect(oreOf(result), seed).toBeGreaterThanOrEqual(VILLAGERS_ORE.min);
      expect(oreOf(result), seed).toBeLessThanOrEqual(VILLAGERS_ORE.max);
      expect(result.xp.every((x) => x.xp === 25), seed).toBe(true);
    }
  });

  it(`is completed by a ranger with a fighter and a villager on every one of ${SEEDS} seeds with no death, for the same ore: one miner standing is enough`, () => {
    for (const { seed, result } of played(GOBLINS, party("ranger", "fighter", "villager"))) {
      expect(result.outcome, seed).toBe("complete");
      expect(result.dead, seed).toEqual([]);
      expect(oreOf(result), seed).toBeGreaterThanOrEqual(VILLAGERS_ORE.min);
      expect(oreOf(result), seed).toBeLessThanOrEqual(VILLAGERS_ORE.max);
    }
  });

  it(`leaves a ranger whose one villager fell with no ore from the veins that came down after: the carrier is worth protecting, on ${SEEDS} seeds`, () => {
    const runs = played(GOBLINS, party("ranger", "villager"));
    const lost = runs.filter((r) => r.result.dead.includes("villager-2"));
    expect(lost.length).toBeGreaterThan(0);
    for (const { seed, result } of runs) {
      expect(result.outcome, seed).toBe("complete");
      if (result.dead.includes("villager-2")) expect(oreOf(result), seed).toBeLessThan(VILLAGERS_ORE.min);
      else expect(oreOf(result), seed).toBeGreaterThanOrEqual(VILLAGERS_ORE.min);
    }
  });

  it("ends well inside its time limit for every party above", () => {
    for (const heroes of [villagers(4), party("ranger", "villager", "villager"), party("ranger", "villager")]) {
      for (const seed of seeds.slice(0, 100)) {
        const { timeline } = replay(snapshot(GOBLINS, heroes), seed, []);
        const end = timeline.events.at(-1)?.timestamp ?? Infinity;
        expect(end, seed).toBeLessThan(stage.timeLimitMs / 2);
      }
    }
  });

  it("is paid for in the hall: a ranger needs the hall's second level, and costs timber and cloth", () => {
    const ranger = location(STARTING_LOCATION)?.recruits.find((r) => r.unitType === "ranger");
    expect(ranger).toEqual({ unitType: "ranger", hallLevel: 2, cost: [{ material: "timber", amount: 40 }, { material: "cloth", amount: 10 }] });
  });
});
