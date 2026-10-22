/**
 * The adventure's determinism test (decision 0030; architecture overview,
 * "The adventure loop"): a run stepped by wall-clock time, the way the
 * browser plays it, and `replay` of its override log, the way the hub
 * verifies it, give the same timeline and result.
 */

import { describe, expect, it } from "vitest";
import { AdventureEngine, replay, type AdventureSnapshot, type PartyOrder, type PlayerOverride } from "../../src/index.js";
import { hero, snapshot, TIMBER, WOLVES } from "./helpers.js";

type Click =
  | { readonly atWallMs: number; readonly heroId: string; readonly override: PlayerOverride }
  | { readonly atWallMs: number; readonly order: PartyOrder };

/** The browser: a frame at a time, stepping every event that is due, clicks between frames. */
function playLive(snap: AdventureSnapshot, seed: string, clicks: readonly Click[], frameMs = 16) {
  const engine = new AdventureEngine(snap, seed);
  const pending = [...clicks].sort((a, b) => a.atWallMs - b.atWallMs);
  let wall = 0;
  while (!engine.isComplete()) {
    while (pending[0] && pending[0].atWallMs <= wall) {
      const click = pending.shift();
      if (click && "order" in click) engine.submitOrder(click.order);
      else if (click) engine.submitOverride(click.heroId, click.override);
    }
    while (!engine.isComplete() && engine.getNextEventTime() <= wall) engine.step();
    wall += frameMs;
  }
  return { timeline: engine.getTimeline(), result: engine.getResult() };
}

const strike: PlayerOverride = { kind: "force-action", abilityId: "strike" };
const chop: PlayerOverride = { kind: "force-action", abilityId: "chop" };
const guard: PlayerOverride = { kind: "force-action", abilityId: "guard" };

const party = [hero("fighter-1", "fighter"), hero("villager-1", "villager"), hero("villager-2", "villager")];

/** Overrides and orders through both jobs: some used, some dropped, a retreat cancelled. */
const clicks: readonly Click[] = [
  { atWallMs: 100, heroId: "villager-1", override: strike }, // travelling: dropped
  { atWallMs: 1000, order: "retreat" },
  { atWallMs: 1500, order: "press-on" }, // before the travel ends: no retreat
  { atWallMs: 4300, heroId: "fighter-1", override: strike },
  { atWallMs: 5200, heroId: "villager-2", override: chop },
  { atWallMs: 6000, order: "retreat" },
  { atWallMs: 6500, order: "press-on" }, // before the first attempt
  { atWallMs: 7000, heroId: "fighter-1", override: guard },
  { atWallMs: 9000, heroId: "villager-1", override: chop },
  { atWallMs: 9010, heroId: "villager-1", override: strike }, // replaces the chop
];

describe("Determinism within one version", () => {
  it("gives the same timeline and result live and replayed, for both jobs and several seeds", () => {
    for (const jobId of [WOLVES, TIMBER]) {
      for (const seed of ["a", "b", "c", "d", "e"]) {
        const snap = snapshot(jobId, party);
        const live = playLive(snap, seed, clicks);
        expect(live.timeline.overrideLog.some((e) => e.kind === "unit")).toBe(true);
        expect(live.timeline.overrideLog.some((e) => e.kind === "party")).toBe(true);
        expect(replay(snap, seed, live.timeline.overrideLog)).toEqual(live);
      }
    }
  });

  it("agrees on a retreat attempted in a fight", () => {
    for (const seed of ["a", "b", "c"]) {
      const snap = snapshot(WOLVES, party);
      const live = playLive(snap, seed, [{ atWallMs: 5000, order: "retreat" }]);
      expect(live.result.outcome).toBe("retreat");
      expect(replay(snap, seed, live.timeline.overrideLog)).toEqual(live);
    }
  });

  it("agrees on a retreat at a stage's end and on a retreat ordered at the very start", () => {
    for (const atWallMs of [0, 2000]) {
      const snap = snapshot(TIMBER, party);
      const live = playLive(snap, "start", [{ atWallMs, order: "retreat" }]);
      expect(live.result.outcome).toBe("retreat");
      expect(replay(snap, "start", live.timeline.overrideLog)).toEqual(live);
    }
  });

  it("gives the same result at any frame rate, and fast-forwarded", () => {
    const snap = snapshot(TIMBER, party);
    const reference = replay(snap, "frames", []);
    for (const frameMs of [1, 7, 16, 33, 250, 5000, 60_000]) {
      expect(playLive(snap, "frames", [], frameMs)).toEqual(reference);
    }
  });
});
