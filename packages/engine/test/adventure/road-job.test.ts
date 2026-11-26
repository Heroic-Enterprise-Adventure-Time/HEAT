import { isEqual } from "es-toolkit";
import { describe, expect, it } from "vitest";

import { type AdventureResult, FACILITIES, JOBS, jobsPostedBy, largestStages, location, MONSTERS, must, type SnapshotHero, STARTING_LOCATION } from "../../src/index.js";
import { CARAVAN, enemiesXp, HIGHCRAG, party, played, RECRUITED_TYPES, ROAD, SEEDS, villagers, WOLVES } from "./helpers.js";

// "Scout the road to Highcrag" (Issue-352, decision 0059): the caravan hub's
// first job, the first that grants an unlock, and the bandit's first job. A
// plain job with no cart: travel, two bandits, arrive. It is a step past the
// wolves job, so this file says which parties open the road, which lose a
// hero doing it, and which do not come back.

const road = JOBS[ROAD];
const fight = road.stages[1];
if (fight?.kind !== "fight") throw new Error("The road job fights second");
const UNLOCK = must(must(location(HIGHCRAG), "Highcrag").unlock, "the unlock Highcrag needs");

/**
 * Every party this file plays, each test taking its party from here, so that
 * the test of the time limit covers them all (typescript.md, rule 26): a lone
 * hero of every type Millbrook recruits, read from the content, and the
 * parties named below.
 */
const LONE = RECRUITED_TYPES.map((unitType) => party(unitType));
const PARTIES = {
  twoVillagers: villagers(2),
  rangerAndVillager: party("ranger", "villager"),
  fourVillagers: villagers(4),
  fighterAndVillager: party("fighter", "villager"),
  fighterAndRanger: party("fighter", "ranger"),
  twoFighters: party("fighter", "fighter"),
  fighterRangerAndVillager: party("fighter", "ranger", "villager"),
  fighterAndThreeVillagers: party("fighter", "villager", "villager", "villager"),
};
const EVERY_PARTY: readonly (readonly SnapshotHero[])[] = [...LONE, ...Object.values(PARTIES)];
/** The parties that do not come back, on any seed. */
const FALL = [...LONE, PARTIES.twoVillagers, PARTIES.rangerAndVillager];
/** The parties that open the road on every seed with nobody lost. */
const SAFE = [PARTIES.twoFighters, PARTIES.fighterRangerAndVillager, PARTIES.fighterAndThreeVillagers];

const named = (heroes: readonly SnapshotHero[]) => heroes.map((h) => h.unitType).join(", ");

/** The run arrived: the road is open, nothing came home, and each survivor has the wolves job's 20 XP. */
function expectOpened(result: AdventureResult, seed: string): void {
  expect(result.outcome, seed).toBe("complete");
  expect(result.unlocks, seed).toEqual([UNLOCK]);
  expect(result.rewards, seed).toEqual([]);
  expect(result.xp.length, seed).toBeGreaterThan(0);
  expect(result.xp.every((x) => x.xp === 20), seed).toBe(true);
}

describe("Scout the road to Highcrag", () => {
  it("is posted by Millbrook's caravan hub, first, and not by the job board", () => {
    expect(road.location).toBe(STARTING_LOCATION);
    expect(road.facility).toBe("caravan-hub");
    expect(FACILITIES["caravan-hub"].levels.length).toBeGreaterThan(0);
    expect(jobsPostedBy(STARTING_LOCATION, "caravan-hub").map((j) => j.id)[0]).toBe(ROAD);
    expect(jobsPostedBy(STARTING_LOCATION, "job-board").map((j) => j.id)).not.toContain(ROAD);
  });

  it("is a plain job with no cart: travel, two bandits and nothing else, arrive, the same on every run", () => {
    expect(road.stages.map((s) => s.kind)).toEqual(["travel", "fight", "arrive"]);
    expect(fight.opponents).toEqual([{ type: "bandit", count: 2 }]);
    expect(isEqual(largestStages(road), road.stages)).toBe(true);
  });

  it("is the bandit's first job: no other job sets one against a party but the caravans the hubs post after it", () => {
    const withBandits = Object.values(JOBS).filter((job) => job.stages.some((s) => (s.kind === "fight" || s.kind === "gather") && s.opponents.some((o) => o.type === "bandit")));
    expect(withBandits.map((job) => job.id)).toEqual([ROAD, CARAVAN, "caravan-to-millbrook"]);
  });

  it("has no pay, and a bonus that brings its XP to the wolves job's 20", () => {
    expect(road.pay).toEqual([]);
    expect(road.bonusXp).toBe(8);
    expect(enemiesXp(road)).toBe(2 * MONSTERS.bandit.xp);
    expect(enemiesXp(road) + road.bonusXp).toBe(20);
    expect(enemiesXp(road) + road.bonusXp).toBe(enemiesXp(JOBS[WOLVES]) + JOBS[WOLVES].bonusXp);
  });

  it("grants the unlock Highcrag needs, and is the only job that grants any", () => {
    expect(road.grants).toEqual([UNLOCK]);
    expect(Object.values(JOBS).filter((job) => (job.grants ?? []).length > 0).map((job) => job.id)).toEqual([ROAD]);
  });

  it("says in its description what it opens: Highcrag, and a camp there", () => {
    expect(road.description).toMatch(/Highcrag/);
    expect(road.description).toMatch(/camp/);
  });

  for (const heroes of FALL) {
    it(`defeats ${named(heroes)} on every one of ${SEEDS} seeds, and the road stays shut`, () => {
      for (const { seed, result } of played(ROAD, heroes)) {
        expect(result.outcome, seed).toBe("defeat");
        expect(result.unlocks, seed).toEqual([]);
        expect(result.xp, seed).toEqual([]);
      }
    });
  }

  for (const heroes of SAFE) {
    it(`is opened by ${named(heroes)} on every one of ${SEEDS} seeds, with nobody lost and 20 XP each`, () => {
      for (const { seed, result } of played(ROAD, heroes)) {
        expectOpened(result, seed);
        expect(result.dead, seed).toEqual([]);
        expect(result.xp, seed).toHaveLength(heroes.length);
      }
    });
  }

  it(`is opened by a fighter with a villager on every one of ${SEEDS} seeds, at the cost of one of the two on about one run in four`, () => {
    const runs = played(ROAD, PARTIES.fighterAndVillager);
    for (const { seed, result } of runs) {
      expectOpened(result, seed);
      expect(result.dead.length, seed).toBeLessThanOrEqual(1);
    }
    const lostOne = runs.filter((r) => r.result.dead.length === 1).length;
    expect(lostOne).toBeGreaterThan(SEEDS * 0.2);
    expect(lostOne).toBeLessThan(SEEDS * 0.34);
    // The bandit strikes the weakest in reach, so it is the villager more often than the fighter.
    const villagerLost = runs.filter((r) => r.result.dead.includes("villager-2")).length;
    expect(villagerLost).toBeGreaterThan(lostOne / 2);
  });

  it(`is opened by a fighter with a ranger on every one of ${SEEDS} seeds, and where a hero is lost it is the fighter, on fewer than one run in five`, () => {
    const runs = played(ROAD, PARTIES.fighterAndRanger);
    for (const { seed, result } of runs) expectOpened(result, seed);
    const lost = runs.filter((r) => r.result.dead.length > 0);
    expect(lost.length).toBeGreaterThan(0);
    expect(lost.length).toBeLessThan(SEEDS * 0.2);
    for (const { seed, result } of lost) expect(result.dead, seed).toEqual(["fighter-1"]);
  });

  it(`is opened by four villagers on every one of ${SEEDS} seeds, and costs them one of their number on most`, () => {
    const runs = played(ROAD, PARTIES.fourVillagers);
    for (const { seed, result } of runs) {
      expectOpened(result, seed);
      expect(result.dead.length, seed).toBeLessThanOrEqual(1);
    }
    expect(runs.filter((r) => r.result.dead.length === 1).length).toBeGreaterThan(SEEDS * 0.7);
  });

  it(`never runs its fight out, for any party of this file, on ${SEEDS} seeds: it ends won or lost well inside its limit`, () => {
    for (const heroes of EVERY_PARTY) {
      for (const { seed, result } of played(ROAD, heroes)) {
        const fought = must(result.stages[1], `the fight of ${seed}`);
        expect(["win", "loss"], `${named(heroes)} ${seed}`).toContain(fought.ended);
        expect(fought.endedAtMs - fought.startedAtMs, `${named(heroes)} ${seed}`).toBeLessThan(fight.timeLimitMs / 2);
      }
    }
  });
});
