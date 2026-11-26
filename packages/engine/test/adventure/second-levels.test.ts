import { describe, expect, it } from "vitest";

import {
  cartCapacity,
  FACILITIES,
  type FacilityKind,
  JOB_WAREHOUSE_LEVEL,
  jobFacilityLevel,
  JOBS,
  jobsPostedBy,
  nextLevel,
  type SnapshotHero,
  STARTING_LOCATION,
  warehouseCapacity,
} from "../../src/index.js";
import { CARAVAN, GOBLINS, haul, LUMBER, ORE, party, played, RECRUITED_TYPES, rewardOf, ROAD, SEAM, SEEDS, STAND, villagers } from "./helpers.js";

// Millbrook's second levels (Issue-357, decision 0059): the mine, the lumber
// camp and the caravan hub each gain a level that costs stone, which only
// Highcrag has. The mine's and the lumber camp's each post a job of their
// own, which needs that level to start; the hub's gives a cart of 200.

/** The facilities that gain a second level, and what it costs. */
const SECOND_LEVELS: readonly { readonly kind: FacilityKind; readonly cost: readonly { material: string; amount: number }[] }[] = [
  { kind: "mine", cost: [{ material: "timber", amount: 100 }, { material: "stone", amount: 40 }] },
  { kind: "lumber-camp", cost: [{ material: "timber", amount: 60 }, { material: "ore", amount: 40 }, { material: "stone", amount: 40 }] },
  { kind: "caravan-hub", cost: [{ material: "timber", amount: 150 }, { material: "ore", amount: 80 }, { material: "stone", amount: 80 }] },
];

describe("the second levels", () => {
  for (const { kind, cost } of SECOND_LEVELS) {
    it(`gives the ${FACILITIES[kind].name.toLowerCase()} a second level, its highest, costing stone within a level-2 warehouse`, () => {
      expect(FACILITIES[kind].levels).toHaveLength(2);
      const second = nextLevel(kind, 1);
      expect(second?.level).toBe(2);
      expect(second?.cost).toEqual(cost);
      expect(second?.cost.some((c) => c.material === "stone")).toBe(true);
      for (const { amount } of second?.cost ?? []) expect(amount).toBeLessThanOrEqual(warehouseCapacity(2));
      expect(nextLevel(kind, 2)).toBeUndefined();
    });
  }

  it("leaves the first levels' costs as they were", () => {
    expect(nextLevel("mine", 0)?.cost).toEqual([{ material: "timber", amount: 60 }, { material: "cloth", amount: 3 }]);
    expect(nextLevel("lumber-camp", 0)?.cost).toEqual([{ material: "timber", amount: 50 }, { material: "ore", amount: 20 }]);
    expect(nextLevel("caravan-hub", 0)?.cost).toEqual([{ material: "timber", amount: 100 }, { material: "ore", amount: 60 }, { material: "cloth", amount: 20 }]);
  });

  it("keeps the hub's second level behind the warehouse's second, as its first is", () => {
    expect(nextLevel("caravan-hub", 1)?.requires).toEqual([{ kind: "warehouse", level: 2 }]);
    expect(nextLevel("mine", 1)?.requires).toEqual([]);
    expect(nextLevel("lumber-camp", 1)?.requires).toEqual([]);
  });

  it("gives the hub's second level a cart of 200 in all, twice its first", () => {
    expect(cartCapacity(2)).toBe(200);
    expect(cartCapacity(2)).toBe(2 * cartCapacity(1));
  });

  it("posts the mine's and the lumber camp's new jobs last on their posters, each needing its facility at level 2", () => {
    expect(jobsPostedBy(STARTING_LOCATION, "mine").map((j) => j.id)).toEqual([ORE, GOBLINS, SEAM]);
    expect(jobsPostedBy(STARTING_LOCATION, "lumber-camp").map((j) => j.id)).toEqual([LUMBER, STAND]);
    expect(jobFacilityLevel(JOBS[SEAM])).toBe(2);
    expect(jobFacilityLevel(JOBS[STAND])).toBe(2);
  });

  it("asks level 1 of every other facility's job, and nothing of the job board's", () => {
    for (const job of Object.values(JOBS)) {
      if (job.id === SEAM || job.id === STAND) continue;
      expect(jobFacilityLevel(job), job.id).toBe(job.facility === undefined ? 0 : 1);
    }
    expect(jobFacilityLevel(JOBS[ROAD])).toBe(1);
    expect(jobFacilityLevel(JOBS[CARAVAN])).toBe(1);
  });

  it("lets each new job bring home more than a level-1 warehouse holds of its one resource, and no more than a level-2", () => {
    expect(JOB_WAREHOUSE_LEVEL[SEAM]).toEqual({ material: "ore", level: 2 });
    expect(JOB_WAREHOUSE_LEVEL[STAND]).toEqual({ material: "timber", level: 2 });
    expect(haul("ore-vein", 2, 5).max).toBeGreaterThan(warehouseCapacity(1));
    expect(haul("ore-vein", 2, 5).max).toBeLessThanOrEqual(warehouseCapacity(2));
    expect(haul("tree", 2, 4).max).toBeLessThanOrEqual(warehouseCapacity(2));
  });
});

/** Every party this file plays, each test taking its party from here (typescript.md, rule 26). */
const PARTIES = {
  minerAndFighter: party("miner", "fighter"),
  minerAndKnight: party("miner", "knight"),
  minerAndRanger: party("miner", "ranger"),
  minerFighterAndRanger: party("miner", "fighter", "ranger"),
  fighterRangerAndTwoVillagers: party("fighter", "ranger", "villager", "villager"),
  lumberjackAndFighter: party("lumberjack", "fighter"),
  lumberjackFighterAndRanger: party("lumberjack", "fighter", "ranger"),
  lumberjackAndTwoFighters: party("lumberjack", "fighter", "fighter"),
  fourVillagers: villagers(4),
};
const EVERY_PARTY: readonly (readonly SnapshotHero[])[] = Object.values(PARTIES);
const named = (heroes: readonly SnapshotHero[]) => heroes.map((h) => h.unitType).join(", ");
const has = (heroes: readonly SnapshotHero[], type: string) => heroes.some((h) => h.unitType === type);

describe("The deep seam", () => {
  const job = JOBS[SEAM];

  it("is four veins or five with two goblin rock throwers behind them, in one gather", () => {
    expect(job.stages.map((s) => s.kind)).toEqual(["travel", "gather", "arrive"]);
    const gather = job.stages[1];
    expect(gather?.kind === "gather" && gather.opponents).toEqual([{ type: "ore-vein", count: { min: 4, max: 5 } }, { type: "goblin-rock-thrower", count: 2 }]);
    expect(job.pay).toEqual([]);
  });

  for (const type of RECRUITED_TYPES.filter((t) => t !== "ranger")) {
    it(`defeats a lone ${type} on every one of ${SEEDS} seeds`, () => {
      for (const { seed, result } of played(SEAM, party(type))) expect(result.outcome, seed).toBe("defeat");
    });
  }

  for (const heroes of [PARTIES.minerAndFighter, PARTIES.minerAndKnight]) {
    it(`is never completed by ${named(heroes)}, on ${SEEDS} seeds: nothing of theirs reaches the goblins in time`, () => {
      for (const { seed, result } of played(SEAM, heroes)) expect(result.outcome, seed).not.toBe("complete");
    });
  }

  for (const heroes of [PARTIES.minerFighterAndRanger, PARTIES.fighterRangerAndTwoVillagers]) {
    const level = has(heroes, "miner") ? 2 : 1;
    it(`is completed by ${named(heroes)} on every one of ${SEEDS} seeds, with ${haul("ore-vein", level, 4).min} to ${haul("ore-vein", level, 5).max} ore and no death`, () => {
      for (const { seed, result } of played(SEAM, heroes)) {
        expect(result.outcome, seed).toBe("complete");
        expect(result.dead, seed).toEqual([]);
        expect(rewardOf(result, "ore"), seed).toBeGreaterThanOrEqual(haul("ore-vein", level, 4).min);
        expect(rewardOf(result, "ore"), seed).toBeLessThanOrEqual(haul("ore-vein", level, 5).max);
      }
    });
  }

  it(`is completed by a miner and a ranger on every one of ${SEEDS} seeds, losing a hero on some: a third hero is what makes it safe`, () => {
    const runs = played(SEAM, PARTIES.minerAndRanger);
    for (const { seed, result } of runs) expect(result.outcome, seed).toBe("complete");
    expect(runs.some((r) => r.result.dead.length > 0)).toBe(true);
  });
});

describe("The old-growth stand", () => {
  const job = JOBS[STAND];

  it("is four trees and two bandits, in one gather", () => {
    expect(job.stages.map((s) => s.kind)).toEqual(["travel", "gather", "arrive"]);
    const gather = job.stages[1];
    expect(gather?.kind === "gather" && gather.opponents).toEqual([{ type: "tree", count: 4 }, { type: "bandit", count: 2 }]);
    expect(job.pay).toEqual([]);
  });

  for (const type of RECRUITED_TYPES) {
    it(`defeats a lone ${type} on every one of ${SEEDS} seeds`, () => {
      for (const { seed, result } of played(STAND, party(type))) expect(result.outcome, seed).toBe("defeat");
    });
  }

  for (const heroes of [PARTIES.lumberjackFighterAndRanger, PARTIES.lumberjackAndTwoFighters, PARTIES.fighterRangerAndTwoVillagers]) {
    const level = has(heroes, "lumberjack") ? 2 : 1;
    it(`is completed by ${named(heroes)} on every one of ${SEEDS} seeds, with ${haul("tree", level, 4).min} to ${haul("tree", level, 4).max} timber and no death`, () => {
      for (const { seed, result } of played(STAND, heroes)) {
        expect(result.outcome, seed).toBe("complete");
        expect(result.dead, seed).toEqual([]);
        expect(rewardOf(result, "timber"), seed).toBeGreaterThanOrEqual(haul("tree", level, 4).min);
        expect(rewardOf(result, "timber"), seed).toBeLessThanOrEqual(haul("tree", level, 4).max);
      }
    });
  }

  it(`is completed by a lumberjack and a fighter on every one of ${SEEDS} seeds, losing a hero on some: a third hero is what makes it safe`, () => {
    const runs = played(STAND, PARTIES.lumberjackAndFighter);
    for (const { seed, result } of runs) expect(result.outcome, seed).toBe("complete");
    expect(runs.some((r) => r.result.dead.length > 0)).toBe(true);
  });
});

describe("both second levels' jobs", () => {
  it(`never run a gather out, for any party of this file, on ${SEEDS} seeds`, () => {
    for (const id of [SEAM, STAND]) {
      for (const heroes of EVERY_PARTY) {
        for (const { seed, result } of played(id, heroes)) {
          for (const stage of result.stages) expect(stage.ended, `${id} ${named(heroes)} ${seed}`).not.toBe("timeout");
        }
      }
    }
  });
});
