/**
 * The determinism test (decision 0030; architecture overview, "The adventure
 * loop"): the same party, encounter, seed and override log, stepped two ways,
 * give the same timeline and outcome. One caller is shaped like the browser:
 * it advances a wall clock in frames, steps whatever is due, and submits
 * overrides when the player clicks. The other is shaped like the hub: it
 * steps from event to event and submits each logged override before the step
 * that reaches its time. New in HEAT; BattleScript Online designed the replay
 * and did not build it.
 */

import { describe, expect, it } from "vitest";
import { CombatEngine, type BattleOutcome, type BattleSetup, type OverrideLogEntry, type PlayerOverride } from "../../src/index.js";
import { hero, opponent, setup } from "./helpers.js";

interface Click {
  readonly atWallMs: number;
  readonly unitId: string;
  readonly override: PlayerOverride;
}

/** The browser: a frame at a time, stepping every event that is due, clicks between frames. */
function playLive(battle: BattleSetup, clicks: readonly Click[], frameMs = 16): BattleOutcome {
  const engine = new CombatEngine(battle);
  const pending = [...clicks].sort((a, b) => a.atWallMs - b.atWallMs);
  let wall = 0;
  while (!engine.isComplete()) {
    while (pending[0] && pending[0].atWallMs <= wall) {
      const click = pending.shift();
      if (click) engine.submitOverride(click.unitId, click.override);
    }
    while (!engine.isComplete() && engine.getNextEventTime() <= wall) engine.step();
    wall += frameMs;
  }
  return engine.getOutcome();
}

/** The hub: event to event, each logged override submitted before the step that reaches its time. */
function replay(battle: BattleSetup, log: readonly OverrideLogEntry[]): BattleOutcome {
  const engine = new CombatEngine(battle);
  let i = 0;
  while (!engine.isComplete()) {
    for (let entry = log[i]; entry && entry.acceptedAtSimTime <= engine.getNextEventTime(); entry = log[++i]) {
      engine.submitOverride(entry.unitId, entry.override);
    }
    engine.step();
  }
  return engine.getOutcome();
}

const party = [hero("fighter-1", "fighter"), hero("villager-1", "villager"), hero("villager-2", "villager")];
const opponents = [opponent("wolf-1", "wolf"), opponent("wolf-2", "wolf"), opponent("bandit-1", "bandit"), opponent("tree-1", "tree")];

const clicks: readonly Click[] = [
  { atWallMs: 40, unitId: "villager-1", override: { kind: "force-action", abilityId: "strike" } }, // not usable from near: dropped
  { atWallMs: 900, unitId: "fighter-1", override: { kind: "force-action", abilityId: "strike" } },
  { atWallMs: 1500, unitId: "villager-2", override: { kind: "force-action", abilityId: "chop" } },
  { atWallMs: 2100, unitId: "villager-1", override: { kind: "force-action", abilityId: "mine" } }, // no ore: dropped
  { atWallMs: 2600, unitId: "villager-1", override: { kind: "force-action", abilityId: "strike" } },
  { atWallMs: 2610, unitId: "villager-1", override: { kind: "force-action", abilityId: "chop" } }, // replaces the strike
  { atWallMs: 4000, unitId: "fighter-1", override: { kind: "force-action", abilityId: "guard" } },
];

describe("Determinism within one version", () => {
  it("gives the same timeline and outcome stepped by wall clock and replayed event by event", () => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      const battle = setup(party, opponents, seed);
      const live = playLive(battle, clicks);
      expect(live.timeline.overrideLog.length).toBeGreaterThan(0);
      expect(replay(battle, live.timeline.overrideLog)).toEqual(live);
    }
  });

  it("gives the same outcome at any frame rate, and fast-forwarded", () => {
    const battle = setup(party, opponents, "frames");
    const reference = replay(battle, []);
    for (const frameMs of [1, 7, 16, 33, 250, 5000]) {
      expect(playLive(battle, [], frameMs)).toEqual(reference);
    }
  });

  it("gives the same timeline when the time limit ends the battle", () => {
    const battle = setup(party, opponents, "short", 3000);
    const live = playLive(battle, clicks);
    expect(live.result).toBe("timeout");
    expect(replay(battle, live.timeline.overrideLog)).toEqual(live);
  });
});
