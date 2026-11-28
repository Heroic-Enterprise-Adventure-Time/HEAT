/**
 * A caravan's cart through an adventure (decision 0059; Issue-353): on a job
 * that delivers to a location, the cart stands beside the party in every
 * fight and gather stage with its health carried between them, a broken cart
 * does not end the run, and the result says whether it stood on arrival.
 */

import { describe, expect, it } from "vitest";

import { type AdventureContent, type AdventureResult, type AdventureTimeline, CART, CART_UNIT_ID, JOBS, must, replay, type SnapshotHero } from "../../src/index.js";
import { CARAVAN_CONTENT, CARAVAN_JOB, named, ofKind, party, ROAD, SEEDS, seeds, snapshot, villagers } from "./helpers.js";

/** The tests' caravan played by a party on a seed, with what the log orders. */
function run(heroes: readonly SnapshotHero[], seed: string, content: AdventureContent = CARAVAN_CONTENT, log: Parameters<typeof replay>[2] = []) {
  return replay(snapshot(CARAVAN_JOB.id, heroes), seed, log, content);
}

/** The cart's health as each battle of the timeline began, in order; absent where it stood in none. */
function cartAtEachBattle(timeline: AdventureTimeline): (number | undefined)[] {
  return ofKind(timeline.events, "battle-start").map((e) => e.participants.find((p) => p.unitId === CART_UNIT_ID)?.health);
}

/** Whether the cart went down on this timeline. */
function broke(timeline: AdventureTimeline): boolean {
  return ofKind(timeline.events, "unit-down").some((e) => e.unitId === CART_UNIT_ID);
}

/** The caravan's content with the cart at one health, so a bandit's first blow breaks it. */
const FRAGILE: AdventureContent = { ...CARAVAN_CONTENT, battle: { ...CARAVAN_CONTENT.battle, cart: { ...CART, health: 1 } } };


/** The rule `delivered` follows: a caravan's result carries it, true exactly when the run arrived with the cart standing. */
function expectDeliveredByRule(result: AdventureResult, timeline: AdventureTimeline, seed: string): void {
  expect(result.delivered, seed).toBe(result.outcome === "complete" && !broke(timeline));
}

describe("a caravan's cart through an adventure", () => {
  it("stands beside the party in every fight, at the content's health as it sets out", () => {
    const { timeline } = run(party("fighter", "villager"), "seed-0");
    const atEach = cartAtEachBattle(timeline);
    expect(atEach).toHaveLength(2);
    expect(atEach[0]).toBe(CART.health);
  });

  it("carries its health from one fight to the next", () => {
    const carried = seeds.map((seed) => run(villagers(2), seed)).find(({ timeline }) => {
      const [first, second] = cartAtEachBattle(timeline);
      return first !== undefined && second !== undefined && second < first;
    });
    const { timeline } = must(carried, "a run whose cart was hit in the first fight and stood");
    const firstBattle = must(ofKind(timeline.events, "battle-start")[0], "the first battle").timestamp;
    const secondBattle = must(ofKind(timeline.events, "battle-start")[1], "the second battle").timestamp;
    const lastHit = ofKind(timeline.events, "action-resolved")
      .filter((e) => e.timestamp >= firstBattle && e.timestamp < secondBattle)
      .flatMap((e) => e.effects)
      .filter((f) => f.kind === "damage" && f.targetId === CART_UNIT_ID)
      .at(-1);
    expect(lastHit?.kind === "damage" ? lastHit.newHealth : undefined).toBe(cartAtEachBattle(timeline)[1]);
  });

  it("is not a hero: it earns no XP and is in neither the health nor the dead of the result", () => {
    const { result } = run(party("fighter", "villager"), "seed-0");
    for (const list of [result.xp, result.health]) expect(list.map((e) => e.heroId)).toEqual(["fighter-1", "villager-2"]);
    expect(result.dead).not.toContain(CART_UNIT_ID);
  });

  it("delivers on arrival with the cart standing", () => {
    const { result, timeline } = run(party("fighter", "villager"), "seed-0");
    expect(result.outcome).toBe("complete");
    expect(broke(timeline)).toBe(false);
    expect(result.delivered).toBe(true);
  });

  it("does not end the run when the cart breaks: the party goes on without it, arrives, and delivers nothing", () => {
    const { result, timeline } = run(party("fighter", "villager"), "seed-0", FRAGILE);
    expect(broke(timeline)).toBe(true);
    expect(cartAtEachBattle(timeline)).toEqual([1, undefined]);
    expect(result.outcome).toBe("complete");
    expect(result.delivered).toBe(false);
  });

  it("delivers nothing on a retreat, with the cart whole", () => {
    const { result, timeline } = run(party("fighter", "villager"), "seed-0", CARAVAN_CONTENT, [{ kind: "party", acceptedAtSimTime: 0, order: "retreat" }]);
    expect(result.outcome).toBe("retreat");
    expect(broke(timeline)).toBe(false);
    expect(result.delivered).toBe(false);
  });

  it("delivers nothing when the heroes are all down, the cart standing or not", () => {
    const lost = seeds.map((seed) => ({ seed, ...run(party("villager"), seed) })).filter((r) => r.result.outcome === "defeat");
    expect(lost.length).toBeGreaterThan(0);
    for (const { seed, result } of lost) expect(result.delivered, seed).toBe(false);
    expect(lost.some((r) => !broke(r.timeline)), "a defeat with the cart standing").toBe(true);
  });

  it("refuses a hero with the cart's id on a job that delivers, and not on one that does not", () => {
    const named = [{ ...must(party("fighter")[0], "the fighter"), heroId: CART_UNIT_ID }];
    expect(() => run(named, "seed-0")).toThrow(/cart's id/);
    expect(() => replay(snapshot(ROAD, named), "seed-0", [])).not.toThrow();
  });

  it("is not on a job that does not deliver: the road job has no cart and its result says nothing of one", () => {
    expect(JOBS[ROAD].deliversTo).toBeUndefined();
    const { result, timeline } = replay(snapshot(ROAD, party("fighter", "fighter")), "seed-0", []);
    expect(ofKind(timeline.events, "battle-start").flatMap((e) => e.participants).some((p) => p.kind === "cart")).toBe(false);
    expect("delivered" in result).toBe(false);
  });

  // The tests' own caravan over 500 seeds per party, with a fighter and
  // without: a fighter's guard covers the cart, so it arrives.
  const WITH_A_FIGHTER = [party("fighter", "villager"), party("fighter", "ranger")];
  const WITHOUT = [villagers(2), party("ranger", "villager")];

  for (const heroes of WITH_A_FIGHTER) {
    it(`is delivered by ${named(heroes)} on every one of ${SEEDS} seeds`, () => {
      for (const seed of seeds) {
        const { result, timeline } = run(heroes, seed);
        expect(result.outcome, seed).toBe("complete");
        expect(result.delivered, seed).toBe(true);
        expectDeliveredByRule(result, timeline, seed);
      }
    });
  }

  for (const heroes of WITHOUT) {
    it(`is lost by ${named(heroes)} on some of ${SEEDS} seeds and delivered on most, by the rule`, () => {
      const runs = seeds.map((seed) => ({ seed, ...run(heroes, seed) }));
      for (const { seed, result, timeline } of runs) expectDeliveredByRule(result, timeline, seed);
      const delivered = runs.filter((r) => r.result.delivered).length;
      const arrivedBroken = runs.filter((r) => r.result.outcome === "complete" && broke(r.timeline)).length;
      expect(delivered).toBeGreaterThan(SEEDS / 2);
      expect(arrivedBroken).toBeGreaterThan(0);
    });
  }
});
