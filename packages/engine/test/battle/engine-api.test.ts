/**
 * Adapted from BattleScript Online, bso-game-shared/src/combat/engine-api.test.ts:
 * the stepping API and the force-action override. The swap-behavior and
 * initial-placement cases are left behind (decision 0030).
 */

import { describe, expect, it } from "vitest";

import { CombatEngine, resolveBattle } from "../../src/index.js";
import { hero, ofKind, opponent, runAll, setup } from "./helpers.js";

const party = [hero("fighter-1", "fighter"), hero("villager-1", "villager")];
const opponents = [opponent("wolf-1", "wolf"), opponent("bandit-1", "bandit")];
const make = (seed = "api"): CombatEngine => new CombatEngine(setup(party, opponents, seed));

describe("CombatEngine.step()", () => {
  it("starts not complete and becomes complete after running to the end", () => {
    const engine = make();
    expect(engine.isComplete()).toBe(false);
    runAll(engine);
    expect(engine.isComplete()).toBe(true);
  });

  it("emits battle-start at clock 0 on the first step", () => {
    const events = make().step();
    expect(events[0]).toMatchObject({ kind: "battle-start", timestamp: 0 });
  });

  it("returns an empty array once complete", () => {
    const engine = make();
    runAll(engine);
    expect(engine.step()).toEqual([]);
  });

  it("gives the same outcome stepped as headless", () => {
    const engine = make("same");
    runAll(engine);
    expect(engine.getOutcome()).toEqual(resolveBattle(setup(party, opponents, "same")));
  });

  it("returns only the new events from each step", () => {
    const engine = make();
    expect(runAll(engine)).toEqual(engine.getOutcome().timeline.events);
  });

  it("increases getCurrentSimTime monotonically, matching getNextEventTime", () => {
    const engine = make();
    let last = 0;
    while (!engine.isComplete()) {
      const next = engine.getNextEventTime();
      engine.step();
      expect(engine.getCurrentSimTime()).toBe(next);
      expect(engine.getCurrentSimTime()).toBeGreaterThanOrEqual(last);
      last = engine.getCurrentSimTime();
    }
  });

  it("reports 0 as the next event time before the first step", () => {
    expect(make().getNextEventTime()).toBe(0);
  });

  it("throws from getOutcome before the battle completes", () => {
    expect(() => make().getOutcome()).toThrow();
  });

  it("logs no overrides when none were issued", () => {
    expect(resolveBattle(setup(party, opponents)).timeline.overrideLog).toEqual([]);
  });
});

describe("CombatEngine player overrides", () => {
  // The villager is below half, so the fighter's list would guard it first.
  const wounded = [hero("fighter-1", "fighter"), hero("villager-1", "villager", 10)];
  const engineFor = (): CombatEngine => new CombatEngine(setup(wounded, [opponent("wolf-1", "wolf")], "override"));

  it("fires the forced ability at the unit's next turn and emits action-overridden", () => {
    const engine = engineFor();
    engine.step();
    engine.submitOverride("fighter-1", { kind: "force-action", abilityId: "strike" });
    const events = runAll(engine);
    const overridden = ofKind(events, "action-overridden");
    expect(overridden).toHaveLength(1);
    expect(overridden[0]).toMatchObject({ unitId: "fighter-1", abilityId: "strike" });
    const firstFighterAction = ofKind(events, "action-declared").find((e) => e.unitId === "fighter-1");
    expect(firstFighterAction?.abilityId).toBe("strike");
  });

  it("logs the override with the simulated time of the turn that used it", () => {
    const engine = engineFor();
    engine.step();
    engine.submitOverride("fighter-1", { kind: "force-action", abilityId: "strike" });
    const events = runAll(engine);
    const turn = ofKind(events, "turn-start").find((e) => e.unitId === "fighter-1");
    expect(engine.getOutcome().timeline.overrideLog).toEqual([
      { acceptedAtSimTime: turn?.timestamp, unitId: "fighter-1", override: { kind: "force-action", abilityId: "strike" } },
    ]);
  });

  it("falls through silently when the ability is not in the unit's list", () => {
    const engine = engineFor();
    engine.step();
    engine.submitOverride("fighter-1", { kind: "force-action", abilityId: "bite" });
    const events = runAll(engine);
    expect(ofKind(events, "action-overridden")).toEqual([]);
    expect(engine.getOutcome().timeline.overrideLog).toEqual([]);
    expect(ofKind(events, "action-declared").find((e) => e.unitId === "fighter-1")?.abilityId).toBe("guard");
  });

  it("falls through silently when the ability is not usable at that turn", () => {
    const engine = new CombatEngine(setup(party, [opponent("wolf-1", "wolf")], "override"));
    engine.step();
    // The villager starts on the near line, where strike reaches nothing.
    engine.submitOverride("villager-1", { kind: "force-action", abilityId: "strike" });
    const events = runAll(engine);
    expect(ofKind(events, "action-overridden")).toEqual([]);
    expect(ofKind(events, "action-declared").find((e) => e.unitId === "villager-1")?.abilityId).toBe("move-up");
  });

  it("replaces a pending override with a newer one", () => {
    const engine = engineFor();
    engine.step();
    engine.submitOverride("fighter-1", { kind: "force-action", abilityId: "guard" });
    engine.submitOverride("fighter-1", { kind: "force-action", abilityId: "strike" });
    expect(engine.getPendingOverride("fighter-1")).toEqual({ kind: "force-action", abilityId: "strike" });
    runAll(engine);
    expect(engine.getOutcome().timeline.overrideLog.map((e) => e.override.abilityId)).toEqual(["strike"]);
  });

  it("removes a pending override on cancel", () => {
    const engine = engineFor();
    engine.step();
    engine.submitOverride("fighter-1", { kind: "force-action", abilityId: "strike" });
    engine.cancelOverride("fighter-1");
    expect(engine.getPendingOverride("fighter-1")).toBeUndefined();
    runAll(engine);
    expect(engine.getOutcome().timeline.overrideLog).toEqual([]);
  });

  it("refuses an override for a unit that is not in the party", () => {
    const engine = engineFor();
    expect(() => {
      engine.submitOverride("wolf-1", { kind: "force-action", abilityId: "bite" });
    }).toThrow();
    expect(() => {
      engine.submitOverride("nobody", { kind: "force-action", abilityId: "strike" });
    }).toThrow();
  });
});
