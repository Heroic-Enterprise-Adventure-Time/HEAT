import { range } from "es-toolkit";
import { describe, expect, it } from "vitest";

import { JOBS, jobsPostedBy, location, replay, RESOURCE_NODES, STARTING_LOCATION, type UnitType, WAREHOUSE_CAPACITY } from "../../src/index.js";
import { GOBLINS, hero, ORE, SEEDS, seeds, snapshot } from "./helpers.js";

// The first mixed stage (Issue-286, decision 0052): three ore veins hold the
// front line and two goblin rock throwers stand behind them. Its numbers are
// checked over seeds with a ranger and without one.

const goblins = JOBS[GOBLINS];
const stage = goblins.stages[1];
if (stage?.kind !== "gather") throw new Error("The goblins job gathers second");
/** What villagers alone bring home from the three veins: a rating of 2 against 3, two thirds of each vein's 30. */
const VILLAGERS_ORE = 60;

const party = (...types: UnitType[]) => types.map((type, i) => hero(`${type}-${i + 1}`, type));
const villagers = (count: number) => party(...range(count).map(() => "villager" as const));

function played(heroes: ReturnType<typeof party>) {
  return seeds.map((seed) => ({ seed, result: replay(snapshot(GOBLINS, heroes), seed, []).result }));
}

const oreOf = (result: ReturnType<typeof replay>["result"]) => result.rewards.find((r) => r.material === "ore")?.amount ?? 0;

describe("Goblins in the old workings", () => {
  it("is the mine's second job: three veins with two goblins behind them, and nothing after", () => {
    expect(jobsPostedBy(STARTING_LOCATION, "mine").map((j) => j.id)).toEqual([ORE, GOBLINS]);
    expect(goblins.stages.map((s) => s.kind)).toEqual(["travel", "gather", "arrive"]);
    expect(stage.opponents).toEqual([{ type: "ore-vein", count: 3 }, { type: "goblin-rock-thrower", count: 2 }]);
    expect(goblins.pay).toEqual([]);
    expect(goblins.xp).toBe(25);
    // Its ceiling fits a level-1 warehouse.
    expect(3 * RESOURCE_NODES["ore-vein"].maxYield).toBeLessThanOrEqual(WAREHOUSE_CAPACITY[0] ?? 0);
  });

  for (const count of [1, 2, 3]) {
    it(`defeats ${count} villager(s) on every one of ${SEEDS} seeds`, () => {
      for (const { seed, result } of played(villagers(count))) expect(result.outcome, seed).toBe("defeat");
    });
  }

  it(`is completed by four villagers on every one of ${SEEDS} seeds with all ${VILLAGERS_ORE} ore, at the cost of a villager on most`, () => {
    const runs = played(villagers(4));
    for (const { seed, result } of runs) {
      expect(result.outcome, seed).toBe("complete");
      expect(oreOf(result), seed).toBe(VILLAGERS_ORE);
    }
    expect(runs.filter((r) => r.result.dead.length > 0).length).toBeGreaterThan(SEEDS / 2);
  });

  it(`defeats a fighter with one villager on every one of ${SEEDS} seeds: neither reaches the goblins in time`, () => {
    for (const { seed, result } of played(party("fighter", "villager"))) expect(result.outcome, seed).toBe("defeat");
  });

  it(`is completed by a ranger with two villagers on every one of ${SEEDS} seeds with no death, for less ore than villagers alone: the ranger's last shots waste the veins`, () => {
    for (const { seed, result } of played(party("ranger", "villager", "villager"))) {
      expect(result.outcome, seed).toBe("complete");
      expect(result.dead, seed).toEqual([]);
      expect(oreOf(result), seed).toBeGreaterThanOrEqual(35);
      expect(oreOf(result), seed).toBeLessThan(VILLAGERS_ORE);
      expect(result.xp.every((x) => x.xp === goblins.xp), seed).toBe(true);
    }
  });

  it(`is completed by a ranger with a fighter and a villager on every one of ${SEEDS} seeds with no death`, () => {
    for (const { seed, result } of played(party("ranger", "fighter", "villager"))) {
      expect(result.outcome, seed).toBe("complete");
      expect(result.dead, seed).toEqual([]);
      expect(oreOf(result), seed).toBeGreaterThan(0);
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
