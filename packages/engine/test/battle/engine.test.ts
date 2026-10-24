/**
 * Adapted from BattleScript Online, bso-game-shared/src/combat/engine.test.ts:
 * same-tick ordering, a battle to a winner, warmup, event order, determinism,
 * deaths, timeline metadata, the front line, and the time limit, which ends
 * as `timeout` here. Status effects, resources, cooldowns, traits and skill
 * trees are left behind (decision 0030). Line collapse as one event, move up,
 * guard and resource nodes are new.
 */

import { describe, expect, it } from "vitest";
import { CombatEngine, chargeMs, findNextUnit, must, resolveBattle, type UnitState } from "../../src/index.js";
import { contentWith, hero, ofKind, opponent, runAll, setup } from "./helpers.js";

function state(unitId: string, chargeTimer: number, extra: Partial<UnitState> = {}): UnitState {
  return {
    unitId,
    kind: "hero",
    type: "villager",
    side: "party",
    stats: { maxHealth: 30, speed: 10, damage: 4, gathering: 4 },
    actions: [],
    acts: true,
    health: 30,
    line: "front",
    chargeTimer,
    currentAction: null,
    guard: null,
    alive: true,
    ...extra,
  };
}

describe("findNextUnit same-tick ordering", () => {
  it("picks the smallest charge timer", () => {
    expect(findNextUnit([state("a", 500), state("b", 200)])?.unitId).toBe("b");
  });

  it("breaks an exact tie by ascending unit id, not array order", () => {
    expect(findNextUnit([state("b", 200), state("a", 200)])?.unitId).toBe("a");
  });

  it("ignores dead units even when they hold the smallest timer", () => {
    expect(findNextUnit([state("a", 100, { alive: false }), state("b", 200)])?.unitId).toBe("b");
  });

  it("ignores units that never act", () => {
    expect(findNextUnit([state("tree", 0, { acts: false }), state("b", 200)])?.unitId).toBe("b");
  });

  it("returns undefined when no unit can act", () => {
    expect(findNextUnit([state("a", 100, { alive: false })])).toBeUndefined();
  });
});

describe("chargeMs", () => {
  it("is ten seconds over the speed, in whole milliseconds", () => {
    expect(chargeMs(10)).toBe(1000);
    expect(chargeMs(8)).toBe(1250);
    expect(chargeMs(12)).toBe(833);
  });
});

describe("CombatEngine", () => {
  const party = [hero("fighter-1", "fighter"), hero("villager-1", "villager")];

  it("completes a battle with a winner", () => {
    const outcome = resolveBattle(setup(party, [opponent("wolf-1", "wolf")]));
    expect(outcome.result).toBe("win");
    expect(outcome.timeline.events.at(-1)).toMatchObject({ kind: "battle-end", result: "win" });
  });

  it("ends in a loss when the party is down", () => {
    const outcome = resolveBattle(setup([hero("villager-1", "villager", 1)], [opponent("wolf-1", "wolf"), opponent("wolf-2", "wolf")]));
    expect(outcome.result).toBe("loss");
    expect(outcome.units.find((u) => u.unitId === "villager-1")).toMatchObject({ health: 0, alive: false });
  });

  it("resolves an action at the end of its warmup", () => {
    const events = resolveBattle(setup(party, [opponent("wolf-1", "wolf")])).timeline.events;
    const declared = ofKind(events, "action-declared");
    expect(declared.length).toBeGreaterThan(0);
    for (const d of declared) {
      const resolved = ofKind(events, "action-resolved").find((r) => r.unitId === d.unitId && r.timestamp === d.resolveTimestamp);
      expect(resolved?.abilityId).toBe(d.abilityId);
    }
  });

  it("resets the charge timer at the unit's speed after resolving", () => {
    const events = resolveBattle(setup([hero("fighter-1", "fighter")], [opponent("wolf-1", "wolf")])).timeline.events;
    const resolved = ofKind(events, "action-resolved").filter((e) => e.unitId === "fighter-1");
    const turns = ofKind(events, "turn-start").filter((e) => e.unitId === "fighter-1");
    const first = resolved[0];
    expect(first).toBeDefined();
    expect(turns[1]?.timestamp).toBe((first?.timestamp ?? 0) + chargeMs(10));
  });

  it("produces events in non-decreasing timestamp order, in whole milliseconds", () => {
    const events = resolveBattle(setup(party, [opponent("wolf-1", "wolf"), opponent("bandit-1", "bandit")])).timeline.events;
    for (let i = 1; i < events.length; i++) {
      expect(events[i]?.timestamp).toBeGreaterThanOrEqual(events[i - 1]?.timestamp ?? 0);
      expect(Number.isInteger(events[i]?.timestamp)).toBe(true);
    }
  });

  it("is deterministic: the same seed produces identical results", () => {
    const run = (): unknown => resolveBattle(setup(party, [opponent("wolf-1", "wolf"), opponent("bandit-1", "bandit")], "same"));
    expect(run()).toEqual(run());
  });

  it("records a unit going down", () => {
    const outcome = resolveBattle(setup(party, [opponent("wolf-1", "wolf")]));
    expect(ofKind(outcome.timeline.events, "unit-down").map((e) => e.unitId)).toContain("wolf-1");
    expect(outcome.units.find((u) => u.unitId === "wolf-1")).toMatchObject({ health: 0, alive: false });
  });

  it("populates the timeline's metadata and reads no clock", () => {
    const outcome = resolveBattle(setup(party, [opponent("wolf-1", "wolf")], "meta", 30_000));
    expect(outcome.timeline).toMatchObject({ schemaVersion: 1, seed: "meta", timeLimitMs: 30_000, overrideLog: [] });
    expect(outcome.timeline.participants).toEqual([
      { unitId: "fighter-1", kind: "hero", type: "fighter", side: "party", line: "front", health: 50, maxHealth: 50 },
      { unitId: "villager-1", kind: "hero", type: "villager", side: "party", line: "near", health: 30, maxHealth: 30 },
      { unitId: "wolf-1", kind: "monster", type: "wolf", side: "opponents", line: "front", health: 24, maxHealth: 24 },
    ]);
    expect(Object.keys(outcome)).not.toContain("createdAt");
  });

  it("starts a hero with the health it carries in", () => {
    const outcome = resolveBattle(setup([hero("fighter-1", "fighter", 20)], [opponent("wolf-1", "wolf")]));
    expect(outcome.timeline.participants[0]).toMatchObject({ health: 20, maxHealth: 50 });
  });

  it("refuses a setup it cannot run", () => {
    expect(() => new CombatEngine(setup([hero("k", "fighter")], [opponent("x", "dragon" as "wolf")]))).toThrow();
    expect(() => new CombatEngine(setup([{ ...hero("k", "fighter"), unitType: "knight" }], [opponent("w", "wolf")]))).toThrow();
    expect(() => new CombatEngine(setup([hero("a", "fighter")], [opponent("a", "wolf")]))).toThrow();
    expect(() => new CombatEngine(setup([{ ...hero("f", "fighter"), health: 0 }], [opponent("w", "wolf")]))).toThrow();
    expect(() => new CombatEngine(setup([], [opponent("w", "wolf")]))).toThrow();
    expect(() => new CombatEngine(setup([hero("f", "fighter")], [opponent("w", "wolf")], "s", 0))).toThrow();
  });
});

describe("Line collapse", () => {
  it("moves a party with nobody in front up one line at the start, as one event", () => {
    const engine = new CombatEngine(setup([hero("v1", "villager"), hero("v2", "villager")], [opponent("wolf-1", "wolf")]));
    const start = engine.step();
    expect(start.map((e) => e.kind)).toEqual(["battle-start", "line-collapsed"]);
    expect(start[1]).toEqual({
      kind: "line-collapsed",
      timestamp: 0,
      side: "party",
      moves: [
        { unitId: "v1", from: "near", to: "front" },
        { unitId: "v2", from: "near", to: "front" },
      ],
    });
  });

  it("moves every living unit on a side up when its front line empties", () => {
    const content = contentWith({ monsters: { bandit: { actions: ["strike-weakest"] } } });
    const engine = new CombatEngine(
      setup([hero("fighter-1", "fighter")], [opponent("wolf-1", "wolf"), opponent("bandit-1", "bandit"), opponent("bandit-2", "bandit")]),
      content,
    );
    const events = runAll(engine);
    const down = ofKind(events, "unit-down").find((e) => e.unitId === "wolf-1");
    expect(down).toBeDefined();
    const collapse = ofKind(events, "line-collapsed").filter((e) => e.side === "opponents");
    expect(collapse).toHaveLength(1);
    expect(collapse[0]?.timestamp).toBe(down?.timestamp);
    expect(collapse[0]?.moves).toEqual([
      { unitId: "bandit-1", from: "near", to: "front" },
      { unitId: "bandit-2", from: "near", to: "front" },
    ]);
  });

  it("collapses again, one event per line, until the front is occupied", () => {
    const content = contentWith({ heroes: { villager: { homeLine: "far" } } });
    const start = new CombatEngine(setup([hero("v1", "villager")], [opponent("wolf-1", "wolf")]), content).step();
    expect(ofKind(start, "line-collapsed").map((e) => e.moves[0])).toEqual([
      { unitId: "v1", from: "far", to: "near" },
      { unitId: "v1", from: "near", to: "front" },
    ]);
  });
});

describe("Move up", () => {
  it("walks a villager up beside the fighter, then swings", () => {
    const events = resolveBattle(setup([hero("fighter-1", "fighter"), hero("villager-1", "villager")], [opponent("wolf-1", "wolf")])).timeline.events;
    const villager = ofKind(events, "action-resolved").filter((e) => e.unitId === "villager-1");
    expect(villager[0]?.abilityId).toBe("move-up");
    expect(villager[0]?.effects).toEqual([{ kind: "move", unitId: "villager-1", from: "near", to: "front" }]);
    expect(villager.slice(1).every((e) => e.abilityId === "strike")).toBe(true);
    expect(villager.length).toBeGreaterThan(1);
  });

  it("is never taken by a fighter, whose list does not have it", () => {
    const events = resolveBattle(setup([hero("fighter-1", "fighter")], [opponent("wolf-1", "wolf")])).timeline.events;
    expect(ofKind(events, "action-declared").some((e) => e.unitId === "fighter-1" && e.abilityId === "move-up")).toBe(false);
  });
});

describe("Time limit", () => {
  it("ends the battle as timeout at exactly the limit", () => {
    const engine = new CombatEngine(setup([hero("fighter-1", "fighter")], [opponent("bandit-1", "bandit"), opponent("bandit-2", "bandit")], "slow", 2500));
    let last = 0;
    while (!engine.isComplete()) {
      const next = engine.getNextEventTime();
      expect(next).toBeLessThanOrEqual(2500);
      expect(next).toBeGreaterThanOrEqual(last);
      last = next;
      engine.step();
    }
    const outcome = engine.getOutcome();
    expect(outcome.result).toBe("timeout");
    expect(outcome.endedAtMs).toBe(2500);
    expect(outcome.timeline.events.at(-1)).toEqual({ kind: "battle-end", timestamp: 2500, result: "timeout" });
    expect(outcome.timeline.events.slice(0, -1).every((e) => e.timestamp < 2500)).toBe(true);
  });
});

describe("Guard", () => {
  // The villager starts in front and the wolf bites the weakest, so every bite is aimed at the villager.
  const content = contentWith({
    heroes: { villager: { homeLine: "front", actions: ["move-up"] } },
  });
  const weakestWolf = {
    ...content,
    abilities: { ...content.abilities, bite: { ...must(content.abilities["bite"], "the bite ability"), targeting: { side: "enemy" as const, reach: [{ actorLine: "front" as const, targetLines: ["front" as const] }], selection: "weakest" as const } } },
  };
  const run = () =>
    resolveBattle(setup([hero("fighter-1", "fighter"), hero("villager-1", "villager", 10)], [opponent("wolf-1", "wolf"), opponent("wolf-2", "wolf")], "guard"), weakestWolf);

  it("guards an ally below half health and takes the hits aimed at it until the guard expires", () => {
    const events = run().timeline.events;
    const guards = ofKind(events, "action-resolved").filter((e) => e.abilityId === "guard");
    expect(guards.length).toBeGreaterThan(0);
    const first = guards[0];
    const effect = first?.effects[0];
    expect(effect).toEqual({ kind: "guard", targetId: "villager-1", until: (first?.timestamp ?? 0) + 4000 });
    const until = effect?.kind === "guard" ? effect.until : 0;

    const bites = ofKind(events, "action-resolved").filter((e) => e.abilityId === "bite");
    const guarded = bites.filter((e) => e.timestamp >= (first?.timestamp ?? 0) && e.timestamp < until);
    expect(guarded.length).toBeGreaterThan(0);
    for (const bite of guarded) {
      expect(bite.targetIds).toEqual(["villager-1"]);
      expect(bite.effects[0]).toMatchObject({ kind: "damage", targetId: "fighter-1", guarding: "villager-1" });
    }
  });

  it("does not guard again while a guard holds, and guards again once it expires", () => {
    const events = run().timeline.events;
    const guards = ofKind(events, "action-resolved").filter((e) => e.abilityId === "guard");
    for (let i = 1; i < guards.length; i++) {
      expect(guards[i]?.timestamp).toBeGreaterThanOrEqual((guards[i - 1]?.timestamp ?? 0) + 4000);
    }
    const strikes = ofKind(events, "action-resolved").filter((e) => e.unitId === "fighter-1" && e.abilityId === "strike");
    expect(strikes.length).toBeGreaterThan(0);
  });

  it("lets a hit through once the guard has expired", () => {
    const events = run().timeline.events;
    const bites = ofKind(events, "action-resolved").filter((e) => e.abilityId === "bite" && e.effects[0]?.kind === "damage");
    const unguarded = bites.filter((e) => e.effects[0]?.kind === "damage" && e.effects[0].targetId === "villager-1");
    const guards = ofKind(events, "action-resolved").filter((e) => e.abilityId === "guard");
    for (const bite of unguarded) {
      const holding = guards.some((g) => g.effects[0]?.kind === "guard" && g.timestamp <= bite.timestamp && g.effects[0].until > bite.timestamp);
      expect(holding).toBe(false);
    }
  });
});

describe("Resource nodes", () => {
  it("never take a turn", () => {
    const events = resolveBattle(setup([hero("villager-1", "villager")], [opponent("tree-1", "tree")])).timeline.events;
    expect(ofKind(events, "turn-start").some((e) => e.unitId === "tree-1")).toBe(false);
  });

  it("are chopped by a villager for their full amount", () => {
    const outcome = resolveBattle(setup([hero("villager-1", "villager")], [opponent("tree-1", "tree")]));
    expect(outcome.result).toBe("win");
    expect(outcome.gathered).toEqual({ timber: 40 });
    const harvests = ofKind(outcome.timeline.events, "action-resolved").flatMap((e) => e.effects);
    expect(harvests[0]).toEqual({ kind: "harvest", targetId: "tree-1", material: "timber", amount: 4, yield: 4, newHealth: 36 });
  });

  it("are gathered only by the ability for their material", () => {
    const outcome = resolveBattle(setup([hero("villager-1", "villager")], [opponent("tree-1", "tree"), opponent("vein-1", "ore-vein")]));
    expect(outcome.gathered).toEqual({ timber: 40, ore: 40 });
    const resolved = ofKind(outcome.timeline.events, "action-resolved");
    expect(resolved.filter((e) => e.abilityId === "chop").every((e) => e.targetIds[0] === "tree-1")).toBe(true);
    expect(resolved.filter((e) => e.abilityId === "mine").every((e) => e.targetIds[0] === "vein-1")).toBe(true);
  });

  it("fall to a regular attack slowly, for a poor yield", () => {
    const outcome = resolveBattle(setup([hero("fighter-1", "fighter")], [opponent("tree-1", "tree")]));
    expect(outcome.result).toBe("win");
    const harvests = ofKind(outcome.timeline.events, "action-resolved").flatMap((e) => e.effects);
    expect(harvests[0]).toEqual({ kind: "harvest", targetId: "tree-1", material: "timber", amount: 3, yield: 1, newHealth: 37 });
    expect(outcome.gathered.timber).toBeLessThan(40);
  });

  it("wait until the monsters are down", () => {
    const events = resolveBattle(setup([hero("villager-1", "villager"), hero("villager-2", "villager")], [opponent("wolf-1", "wolf"), opponent("tree-1", "tree")])).timeline.events;
    const wolfDown = ofKind(events, "unit-down").find((e) => e.unitId === "wolf-1");
    expect(wolfDown).toBeDefined();
    const firstChop = ofKind(events, "action-declared").find((e) => e.abilityId === "chop");
    expect(firstChop?.timestamp).toBeGreaterThanOrEqual(wolfDown?.timestamp ?? Infinity);
  });
});
