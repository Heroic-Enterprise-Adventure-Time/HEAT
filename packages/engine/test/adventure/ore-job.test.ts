import { range } from "es-toolkit";
import { describe, expect, it } from "vitest";

import { FACILITIES, JOBS, jobsPostedBy, location, replay, STARTING_LOCATION } from "../../src/index.js";
import { hero, ORE, snapshot } from "./helpers.js";

// The mine's first job (Issue-133, decision 0031): posted by the mine, not
// the job board, and one run of it pays for a fighter.

const SEEDS = 500;
const seeds = range(SEEDS).map((i) => `seed-${i}`);
const ore = JOBS[ORE];
const gather = ore.stages[1];
if (gather?.kind !== "gather") throw new Error("The ore job gathers second");

describe("Ore from the hill", () => {
  it("is posted by Millbrook's mine and not by its job board", () => {
    expect(ore.facility).toBe("mine");
    expect(FACILITIES.mine.levels.length).toBeGreaterThan(0);
    expect(jobsPostedBy(STARTING_LOCATION, "mine").map((j) => j.id)).toEqual([ORE]);
    expect(jobsPostedBy(STARTING_LOCATION, "job-board").map((j) => j.id)).not.toContain(ORE);
  });

  it("gathers from 2 ore veins, then fights a wolf", () => {
    expect(ore.stages.map((s) => s.kind)).toEqual(["travel", "gather", "fight", "arrive"]);
    expect(gather.nodes).toEqual([{ type: "ore-vein", count: 2 }]);
    expect(gather.carry).toBe(40);
    expect(ore.pay).toEqual([]);
    expect(ore.xp).toBe(15);
  });

  it(`is completed by a lone villager on every one of ${SEEDS} seeds, with 40 ore and no death`, () => {
    const party = [hero("villager-1", "villager")];
    for (const seed of seeds) {
      const { result } = replay(snapshot(ORE, party), seed, []);
      expect(result.outcome, seed).toBe("complete");
      expect(result.dead, seed).toEqual([]);
      expect(result.rewards, seed).toEqual([{ material: "ore", amount: gather.carry }]);
      expect(result.xp, seed).toEqual([{ heroId: "villager-1", xp: ore.xp }]);
    }
  });

  it(`is completed by a fighter with a villager on every one of ${SEEDS} seeds, with 40 ore and no death`, () => {
    const party = [hero("fighter-1", "fighter"), hero("villager-1", "villager")];
    for (const seed of seeds) {
      const { result } = replay(snapshot(ORE, party), seed, []);
      expect(result.outcome, seed).toBe("complete");
      expect(result.dead, seed).toEqual([]);
      expect(result.rewards, seed).toEqual([{ material: "ore", amount: gather.carry }]);
    }
  });

  it("pays for a fighter in one run", () => {
    const fighter = location(STARTING_LOCATION)?.recruits.find((r) => r.unitType === "fighter");
    expect(fighter?.cost).toEqual([{ material: "ore", amount: gather.carry }]);
  });
});
