import { describe, expect, it } from "vitest";

import { CART_CAPACITY, cartCapacity, hubLevelCarrying, JOBS, jobsPostedBy, MONSTERS, must, type SnapshotHero, STARTING_LOCATION } from "../../src/index.js";
import { CARAVAN, CARAVAN_BACK, enemiesXp, HIGHCRAG, party, played, ROAD, SEEDS, villagers } from "./helpers.js";

// "Caravan to Highcrag" (Issue-354, decision 0059): the caravan hub's
// caravan, the first job of the content that delivers. Its road is the one
// Issue-353's tests played, one bandit a fight with a wolf on half the seeds,
// two fights, because two bandits a fight lose the cart to nearly every
// party. This file says which parties deliver, which arrive with the cart
// broken, and which do not come back.

const caravan = JOBS[CARAVAN];

/**
 * Every party this file plays, each test taking its party from here, so that
 * the test of the time limit covers them all (typescript.md, rule 26).
 */
const PARTIES = {
  fighter: party("fighter"),
  villager: party("villager"),
  fighterAndVillager: party("fighter", "villager"),
  fighterAndRanger: party("fighter", "ranger"),
  twoFighters: party("fighter", "fighter"),
  fighterRangerAndVillager: party("fighter", "ranger", "villager"),
  fighterAndThreeVillagers: party("fighter", "villager", "villager", "villager"),
  twoVillagers: villagers(2),
  rangerAndVillager: party("ranger", "villager"),
  fourVillagers: villagers(4),
};
const EVERY_PARTY: readonly (readonly SnapshotHero[])[] = Object.values(PARTIES);
/** A fighter and one more hero or more: the fighter's guard covers the cart, so it arrives on every seed. */
const WITH_A_FIGHTER = [PARTIES.fighterAndVillager, PARTIES.fighterAndRanger, PARTIES.twoFighters, PARTIES.fighterRangerAndVillager, PARTIES.fighterAndThreeVillagers];
/** Pairs with no fighter: they come through, and lose the cart on some runs. */
const NO_FIGHTER = [PARTIES.twoVillagers, PARTIES.rangerAndVillager];

const named = (heroes: readonly SnapshotHero[]) => heroes.map((h) => h.unitType).join(", ");

describe("Caravan to Highcrag", () => {
  it("is posted by Millbrook's caravan hub, after the road job, and delivers to Highcrag", () => {
    expect(caravan.location).toBe(STARTING_LOCATION);
    expect(caravan.facility).toBe("caravan-hub");
    expect(caravan.deliversTo).toBe(HIGHCRAG);
    expect(jobsPostedBy(STARTING_LOCATION, "caravan-hub").map((j) => j.id)).toEqual([ROAD, CARAVAN]);
  });

  it("is one of the two jobs of the content that deliver, with Highcrag's route back", () => {
    expect(Object.values(JOBS).filter((job) => job.deliversTo !== undefined).map((job) => job.id)).toEqual([CARAVAN, CARAVAN_BACK]);
  });

  it("is two fights, one bandit in each and a wolf on half of them, between travels", () => {
    expect(caravan.stages.map((s) => s.kind)).toEqual(["travel", "fight", "travel", "fight", "arrive"]);
    for (const stage of caravan.stages) {
      if (stage.kind !== "fight") continue;
      expect(stage.opponents).toEqual([{ type: "bandit", count: 1 }, { type: "wolf", count: 1, chancePercent: 50 }]);
    }
  });

  it("has no pay and grants nothing, and its bonus brings its XP to the road job's 20, a wolf adding its own", () => {
    expect(caravan.pay).toEqual([]);
    expect(caravan.grants).toBeUndefined();
    expect(enemiesXp(caravan)).toBe(2 * MONSTERS.bandit.xp);
    expect(enemiesXp(caravan) + caravan.bonusXp).toBe(enemiesXp(JOBS[ROAD]) + JOBS[ROAD].bonusXp);
  });

  for (const heroes of WITH_A_FIGHTER) {
    it(`is delivered by ${named(heroes)} on every one of ${SEEDS} seeds`, () => {
      for (const { seed, result } of played(CARAVAN, heroes)) {
        expect(result.outcome, seed).toBe("complete");
        expect(result.delivered, seed).toBe(true);
      }
    });
  }

  for (const heroes of [PARTIES.fighterAndRanger, PARTIES.twoFighters, PARTIES.fighterRangerAndVillager, PARTIES.fighterAndThreeVillagers]) {
    it(`is delivered by ${named(heroes)} with nobody lost on any of ${SEEDS} seeds`, () => {
      for (const { seed, result } of played(CARAVAN, heroes)) expect(result.dead, seed).toEqual([]);
    });
  }

  for (const heroes of NO_FIGHTER) {
    it(`is delivered by ${named(heroes)} on more than half of ${SEEDS} seeds, and arrives with the cart broken on some`, () => {
      const runs = played(CARAVAN, heroes);
      expect(runs.filter((r) => r.result.delivered === true).length).toBeGreaterThan(SEEDS / 2);
      expect(runs.some((r) => r.result.outcome === "complete" && r.result.delivered === false)).toBe(true);
    });
  }

  it(`is delivered by four villagers on every one of ${SEEDS} seeds`, () => {
    for (const { seed, result } of played(CARAVAN, PARTIES.fourVillagers)) expect(result.delivered, seed).toBe(true);
  });

  it(`defeats a lone fighter on some of ${SEEDS} seeds, and delivers whenever it arrives`, () => {
    const runs = played(CARAVAN, PARTIES.fighter);
    expect(runs.some((r) => r.result.outcome === "defeat")).toBe(true);
    for (const { seed, result } of runs) expect(result.delivered, seed).toBe(result.outcome === "complete");
  });

  it(`is never delivered by a lone villager on ${SEEDS} seeds`, () => {
    for (const { seed, result } of played(CARAVAN, PARTIES.villager)) expect(result.delivered, seed).toBe(false);
  });

  it(`never runs a fight out, for any party of this file, on ${SEEDS} seeds`, () => {
    for (const heroes of EVERY_PARTY) {
      for (const { seed, result } of played(CARAVAN, heroes)) {
        for (const stage of result.stages) expect(stage.ended, `${named(heroes)} ${seed}`).not.toBe("timeout");
      }
    }
  });
});

describe("the cart's capacity", () => {
  it("is 100 in all at hub level 1, and nothing below it", () => {
    expect(cartCapacity(1)).toBe(100);
    expect(cartCapacity(0)).toBe(0);
    expect(cartCapacity(CART_CAPACITY.length + 1)).toBe(must(CART_CAPACITY.at(-1), "the highest level's cart"));
  });

  it("names the least hub level whose cart carries a load, and none for a load no cart carries", () => {
    expect(hubLevelCarrying(0)).toBe(1);
    expect(hubLevelCarrying(100)).toBe(1);
    expect(hubLevelCarrying(must(CART_CAPACITY.at(-1), "the highest level's cart") + 1)).toBeUndefined();
  });
});
