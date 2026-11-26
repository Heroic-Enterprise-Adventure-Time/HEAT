import { describe, expect, it } from "vitest";

import { JOBS, jobsPostedBy, replay, type UnitType } from "../../src/index.js";
import { CRAG, haul, HIGHCRAG, HIGHCRAG_RECRUITS, ORE, party, rewardOf, SEEDS, seeds, snapshot } from "./helpers.js";

// Highcrag's one board job (Issue-351, decision 0059): the mine's first job
// on another hill, for the parties Highcrag can field, which are miners and
// fighters. A camp there has no free hero, so the job is one a lone miner
// completes without dying, and one run of it pays for a fighter.

const crag = JOBS[CRAG];
const gather = crag.stages[1];
if (gather?.kind !== "gather") throw new Error("The crag job gathers second");
/** What a party with a miner brings home from the two veins: each vein's drop at mining 2. */
const MINERS_ORE = haul("ore-vein", 2, 2);

/** The parties played. */
const PARTIES: readonly (readonly UnitType[])[] = [
  ["miner"],
  ["fighter"],
  ["miner", "miner"],
  ["miner", "fighter"],
  ["fighter", "fighter"],
  ["miner", "miner", "miner", "miner"],
];

describe("Ore from the crag", () => {
  it("is posted by Highcrag's job board, and is the only job the board posts there", () => {
    expect(crag.location).toBe(HIGHCRAG);
    expect(crag.facility).toBeUndefined();
    expect(jobsPostedBy(HIGHCRAG, "job-board").map((j) => j.id)).toEqual([CRAG]);
  });

  it("has the stages, the pay and the bonus of the mine's first job, and grants nothing", () => {
    expect(crag.stages).toEqual(JOBS[ORE].stages);
    expect(crag.stages.map((s) => s.kind)).toEqual(["travel", "gather", "fight", "arrive"]);
    expect(gather.opponents).toEqual([{ type: "ore-vein", count: 2 }]);
    expect(crag.pay).toEqual([]);
    expect(crag.bonusXp).toBe(JOBS[ORE].bonusXp);
    expect(crag.grants).toBeUndefined();
  });

  it("is played only by unit types Highcrag recruits", () => {
    const recruited = HIGHCRAG_RECRUITS.map((r) => r.unitType);
    for (const types of PARTIES) for (const type of types) expect(recruited).toContain(type);
  });

  for (const types of PARTIES) {
    const mines = types.includes("miner");
    const words = mines ? `${MINERS_ORE.min} to ${MINERS_ORE.max} ore` : "no ore, which a fighter cannot gather";
    it(`is completed by ${types.join(" and ")} on every one of ${SEEDS} seeds, with ${words}, 15 XP each and no death`, () => {
      expect(MINERS_ORE).toEqual({ min: 56, max: 64 });
      const heroes = party(...types);
      for (const seed of seeds) {
        const { result } = replay(snapshot(CRAG, heroes), seed, []);
        expect(result.outcome, seed).toBe("complete");
        expect(result.dead, seed).toEqual([]);
        expect(result.rewards.map((r) => r.material), seed).toEqual(mines ? ["ore"] : []);
        if (mines) {
          expect(rewardOf(result, "ore"), seed).toBeGreaterThanOrEqual(MINERS_ORE.min);
          expect(rewardOf(result, "ore"), seed).toBeLessThanOrEqual(MINERS_ORE.max);
        }
        expect(result.xp.map((x) => x.xp), seed).toEqual(heroes.map(() => 15));
        expect(result.unlocks, seed).toEqual([]);
      }
    });
  }

  it("pays for a fighter in one run by a lone miner, at its worst roll, and for the ore of a second miner", () => {
    const fighter = HIGHCRAG_RECRUITS.find((r) => r.unitType === "fighter");
    const miner = HIGHCRAG_RECRUITS.find((r) => r.unitType === "miner");
    expect(fighter?.cost.map((c) => c.material)).toEqual(["ore"]);
    expect(fighter?.cost[0]?.amount).toBeLessThanOrEqual(MINERS_ORE.min);
    expect(miner?.cost.find((c) => c.material === "ore")?.amount).toBeLessThanOrEqual(MINERS_ORE.min);
  });
});
