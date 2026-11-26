import { describe, expect, it } from "vitest";

import { JOBS, jobsPostedBy, must, type SnapshotHero, UNIT_PROFILES, WEAPON_SPRITES } from "../../src/index.js";
import { CARAVAN, CARAVAN_BACK, HIGHCRAG, party, played, SEEDS, WOLVES } from "./helpers.js";

// The knight (Issue-356, decision 0059): Highcrag's own, a heavier fighter,
// slower and harder to put down, with the fighter's list.

const knight = must(UNIT_PROFILES.knight, "the knight's profile");
const fighter = must(UNIT_PROFILES.fighter, "the fighter's profile");

describe("the knight", () => {
  it("stands on the front line with 70 health, speed 8 and damage 7, guards and strikes, and carries no trait", () => {
    expect(knight).toEqual({ homeLine: "front", stats: { maxHealth: 70, speed: 8, damage: 7, traits: [] }, actions: ["guard", "strike"] });
    expect(knight.actions).toEqual(fighter.actions);
    expect(knight.stats.maxHealth).toBeGreaterThan(fighter.stats.maxHealth);
    expect(knight.stats.speed).toBeLessThan(fighter.stats.speed);
  });

  it("acts with a longsword of its own, not the fighter's sword", () => {
    expect(WEAPON_SPRITES.knight).toBe("longsword-01");
    expect(WEAPON_SPRITES.knight).not.toBe(WEAPON_SPRITES.fighter);
  });

  it(`holds two wolves alone on every one of ${SEEDS} seeds, where a lone fighter falls on some`, () => {
    for (const { seed, result } of played(WOLVES, party("knight"))) {
      expect(result.outcome, seed).toBe("complete");
      expect(result.dead, seed).toEqual([]);
    }
    expect(played(WOLVES, party("fighter")).some((r) => r.result.outcome === "defeat")).toBe(true);
  });
});

/** Every party this file plays on the route back (typescript.md, rule 26): the parties Highcrag can field. */
const PARTIES = {
  minerAndKnight: party("miner", "knight"),
  minerAndFighter: party("miner", "fighter"),
  twoFighters: party("fighter", "fighter"),
  knightAndTwoMiners: party("knight", "miner", "miner"),
  knight: party("knight"),
};
const named = (heroes: readonly SnapshotHero[]) => heroes.map((h) => h.unitType).join(", ");

describe("Caravan to Millbrook", () => {
  const back = JOBS[CARAVAN_BACK];

  it("is posted by Highcrag's caravan hub and delivers to Millbrook, on the road of the caravan the other way", () => {
    expect(back.location).toBe(HIGHCRAG);
    expect(back.facility).toBe("caravan-hub");
    expect(back.deliversTo).toBe(JOBS[CARAVAN].location);
    expect(jobsPostedBy(HIGHCRAG, "caravan-hub").map((j) => j.id)).toEqual([CARAVAN_BACK]);
    expect(back.stages).toEqual(JOBS[CARAVAN].stages);
    expect(back.pay).toEqual(JOBS[CARAVAN].pay);
    expect(back.bonusXp).toBe(JOBS[CARAVAN].bonusXp);
    expect(back.grants).toBeUndefined();
  });

  for (const heroes of [PARTIES.minerAndKnight, PARTIES.twoFighters, PARTIES.knightAndTwoMiners]) {
    it(`is delivered by ${named(heroes)} on every one of ${SEEDS} seeds, with nobody lost`, () => {
      for (const { seed, result } of played(CARAVAN_BACK, heroes)) {
        expect(result.delivered, seed).toBe(true);
        expect(result.dead, seed).toEqual([]);
      }
    });
  }

  it(`is delivered by a miner and a fighter on every one of ${SEEDS} seeds`, () => {
    for (const { seed, result } of played(CARAVAN_BACK, PARTIES.minerAndFighter)) expect(result.delivered, seed).toBe(true);
  });

  it(`defeats a lone knight on some of ${SEEDS} seeds, and delivers whenever it arrives`, () => {
    const runs = played(CARAVAN_BACK, PARTIES.knight);
    expect(runs.some((r) => r.result.outcome === "defeat")).toBe(true);
    for (const { seed, result } of runs) expect(result.delivered, seed).toBe(result.outcome === "complete");
  });
});
