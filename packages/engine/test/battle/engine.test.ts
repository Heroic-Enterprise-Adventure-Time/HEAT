/**
 * Adapted from BattleScript Online, bso-game-shared/src/combat/engine.test.ts:
 * same-tick ordering, a battle to a winner, warmup, event order, determinism,
 * deaths, timeline metadata, the front line, and the time limit, which ends
 * as `timeout` here. Status effects, resources, cooldowns, traits and skill
 * trees are left behind (decision 0030). Line collapse as one event, move up,
 * guard, resource nodes, drops and enemy XP are new.
 */

import { range, sortBy, zip } from "es-toolkit";
import { describe, expect, it } from "vitest";

import {
  BATTLE_TIMELINE_SCHEMA_VERSION,
  type BattleContent,
  type BattleOutcome,
  chargeMs,
  CombatEngine,
  type Drop,
  type DropRow,
  findNextUnit,
  type GatheringTrait,
  MONSTERS,
  must,
  type PartyMember,
  resolveBattle,
  RESOURCE_NODES,
  rollDrops,
  type UnitState,
} from "../../src/index.js";
import { contentWith, hero, ofKind, opponent, runAll, setup, unitState } from "./helpers.js";

/** A unit by the charge timer it holds, which is all `findNextUnit` reads beside whether it lives and acts. */
const state = (unitId: string, chargeTimer: number, extra: Partial<UnitState> = {}): UnitState => unitState(unitId, { chargeTimer, ...extra });

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
    expect(outcome.timeline).toMatchObject({ schemaVersion: BATTLE_TIMELINE_SCHEMA_VERSION, seed: "meta", timeLimitMs: 30_000, overrideLog: [] });
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
    expect(() => new CombatEngine(setup([{ ...hero("k", "fighter"), unitType: "wizard" }], [opponent("w", "wolf")]))).toThrow();
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

  it("take a hit as any unit does, and give nothing for it", () => {
    const outcome = resolveBattle(setup([hero("villager-1", "villager")], [opponent("tree-1", "tree")]));
    const hits = ofKind(outcome.timeline.events, "action-resolved");
    expect(must(hits[0], "the first hit").effects).toEqual([{ kind: "damage", targetId: "tree-1", amount: 4, newHealth: 36 }]);
    const down = must(ofKind(outcome.timeline.events, "unit-down")[0], "the tree's fall");
    expect(ofKind(outcome.timeline.events, "drop").every((e) => e.timestamp === down.timestamp)).toBe(true);
  });

  it("are worked only by the ability of their kind", () => {
    const outcome = resolveBattle(setup([hero("villager-1", "villager")], [opponent("tree-1", "tree"), opponent("vein-1", "ore-vein")]));
    const resolved = ofKind(outcome.timeline.events, "action-resolved");
    expect(resolved.filter((e) => e.abilityId === "chop").every((e) => e.targetIds[0] === "tree-1")).toBe(true);
    expect(resolved.filter((e) => e.abilityId === "mine").every((e) => e.targetIds[0] === "vein-1")).toBe(true);
    expect(resolved.some((e) => e.abilityId === "chop") && resolved.some((e) => e.abilityId === "mine")).toBe(true);
  });

  it("stand with monsters in one battle, which ends only when all of them are down", () => {
    const outcome = resolveBattle(setup([hero("villager-1", "villager"), hero("villager-2", "villager")], [opponent("wolf-1", "wolf"), opponent("tree-1", "tree")]));
    expect(outcome.result).toBe("win");
    const downs = ofKind(outcome.timeline.events, "unit-down").map((e) => e.unitId);
    expect(downs).toEqual(expect.arrayContaining(["wolf-1", "tree-1"]));
    // The tree falls last: its fall, what it dropped, and the end.
    expect(outcome.timeline.events.slice(-3).map((e) => e.kind)).toEqual(["unit-down", "drop", "battle-end"]);
  });

  it("wait until the monsters are down", () => {
    const events = resolveBattle(setup([hero("villager-1", "villager"), hero("villager-2", "villager")], [opponent("wolf-1", "wolf"), opponent("tree-1", "tree")])).timeline.events;
    const wolfDown = ofKind(events, "unit-down").find((e) => e.unitId === "wolf-1");
    expect(wolfDown).toBeDefined();
    const firstChop = ofKind(events, "action-declared").find((e) => e.abilityId === "chop");
    expect(firstChop?.timestamp).toBeGreaterThanOrEqual(wolfDown?.timestamp ?? Infinity);
  });
});

/** The seeds a drop is checked over. */
const seeds = range(200).map((i) => `seed-${i}`);
const [timberAt1, timberAt2] = must(RESOURCE_NODES.tree.drops[0], "the tree's drop").levels;
const level1 = must(timberAt1, "the tree's row at woodcutting 1");
const level2 = must(timberAt2, "the tree's row at woodcutting 2");

/** One tree, felled by this party on this seed. */
function fell(party: readonly PartyMember[], seed: string, content?: BattleContent): BattleOutcome {
  return resolveBattle(setup(party, [opponent("tree-1", "tree")], seed), content);
}

describe("Drops (decision 0058)", () => {
  it("fall when the enemy goes down, as one event after its fall, and are the battle's drops", () => {
    const outcome = fell([hero("villager-1", "villager")], "seed-1");
    const events = outcome.timeline.events;
    const down = events.findIndex((e) => e.kind === "unit-down" && e.unitId === "tree-1");
    const drop = must(ofKind(events, "drop")[0], "the drop");
    expect(events[down + 1]).toBe(drop);
    expect(drop).toEqual({ kind: "drop", timestamp: must(events[down], "the fall").timestamp, unitId: "tree-1", material: "timber", amount: outcome.drops.timber });
    expect(ofKind(events, "drop")).toHaveLength(1);
  });

  it("are read at level 1 for a villager: 30 to 36 timber a tree, always, and every amount of the range on some seed", () => {
    const amounts = seeds.map((seed) => fell([hero("villager-1", "villager")], seed).drops.timber ?? 0);
    expect(Math.min(...amounts)).toBe(level1.min);
    expect(Math.max(...amounts)).toBe(level1.max);
    expect(new Set(amounts).size).toBe(level1.max - level1.min + 1);
  });

  it("are read at level 2 for a lumberjack: 42 to 50 timber a tree, always", () => {
    const amounts = seeds.map((seed) => fell([hero("lumberjack-1", "lumberjack")], seed).drops.timber ?? 0);
    expect(Math.min(...amounts)).toBe(level2.min);
    expect(Math.max(...amounts)).toBe(level2.max);
  });

  it("read the last row for a level above it", () => {
    for (const seed of seeds.slice(0, 50)) {
      const master = fell([hero("villager-1", "villager", undefined, [{ trait: "woodcutting", level: 5 }])], seed);
      const lumberjack = fell([hero("villager-1", "villager", undefined, [{ trait: "woodcutting", level: 2 }])], seed);
      expect(master.drops, seed).toEqual(lumberjack.drops);
    }
  });

  it("go by the highest level among the heroes standing, not by who hit: a lumberjack beside a villager and a fighter is level 2", () => {
    for (const seed of seeds.slice(0, 50)) {
      const mixed = fell([hero("fighter-1", "fighter"), hero("villager-1", "villager"), hero("lumberjack-1", "lumberjack")], seed);
      const hitters = new Set(ofKind(mixed.timeline.events, "action-resolved").map((e) => e.unitId));
      expect(hitters.size, seed).toBeGreaterThan(1);
      expect(mixed.drops.timber, seed).toBeGreaterThanOrEqual(level2.min);
      // One enemy on one seed rolls the same whoever felled it.
      expect(mixed.drops, seed).toEqual(fell([hero("lumberjack-1", "lumberjack")], seed).drops);
    }
  });

  it("need a carrier: a fighter alone fells the tree and nothing drops", () => {
    for (const seed of seeds.slice(0, 50)) {
      const outcome = fell([hero("fighter-1", "fighter")], seed);
      expect(outcome.result, seed).toBe("win");
      expect(outcome.drops, seed).toEqual({});
      expect(ofKind(outcome.timeline.events, "drop"), seed).toEqual([]);
      expect(ofKind(outcome.timeline.events, "unit-down").map((e) => e.unitId), seed).toEqual(["tree-1"]);
    }
  });

  it("need only one carrier: a fighter's hits cost a villager's tree nothing", () => {
    for (const seed of seeds.slice(0, 50)) {
      const together = fell([hero("fighter-1", "fighter"), hero("villager-1", "villager")], seed);
      expect(ofKind(together.timeline.events, "action-resolved").some((e) => e.unitId === "fighter-1" && e.targetIds[0] === "tree-1"), seed).toBe(true);
      expect(together.drops, seed).toEqual(fell([hero("villager-1", "villager")], seed).drops);
    }
  });

  it("do not count a carrier that is down: the wolf takes the villager, the ranger fells the tree, and no timber drops", () => {
    // A wolf that only scratches, so the ranger outlives it; the villager, at one health, does not.
    const content = contentWith({ monsters: { wolf: { stats: { ...MONSTERS.wolf.stats, damage: 1 } } } });
    for (const seed of seeds.slice(0, 50)) {
      const party = [hero("ranger-1", "ranger"), hero("villager-1", "villager", 1)];
      const outcome = resolveBattle(setup(party, [opponent("wolf-1", "wolf"), opponent("tree-1", "tree")], seed), content);
      const downs = ofKind(outcome.timeline.events, "unit-down").map((e) => e.unitId);
      expect(outcome.result, seed).toBe("win");
      expect(downs.indexOf("villager-1"), seed).toBeLessThan(downs.indexOf("tree-1"));
      expect(downs.indexOf("villager-1"), seed).toBeGreaterThanOrEqual(0);
      // What the ranger can gather, the wolf's hide, is all that may have dropped (Issue-340).
      expect(outcome.drops.timber, seed).toBeUndefined();
      expect(ofKind(outcome.timeline.events, "drop").filter((e) => e.material !== "hide"), seed).toEqual([]);
    }
  });

  it("are the same for a seed whatever is forced: strikes in place of chops change the fight and not the roll", () => {
    for (const seed of seeds.slice(0, 50)) {
      const engine = new CombatEngine(setup([hero("villager-1", "villager")], [opponent("tree-1", "tree")], seed));
      while (!engine.isComplete()) {
        engine.submitOverride("villager-1", { kind: "force-action", abilityId: "strike" });
        engine.step();
      }
      const forced = engine.getOutcome();
      expect(forced.timeline.overrideLog.length, seed).toBeGreaterThan(0);
      expect(forced.drops, seed).toEqual(fell([hero("villager-1", "villager")], seed).drops);
    }
  });

  it("give each tree of a stage a roll of its own", () => {
    const differing = seeds.filter((seed) => {
      const events = resolveBattle(setup([hero("villager-1", "villager")], [opponent("tree-1", "tree"), opponent("tree-2", "tree")], seed)).timeline.events;
      const [first, second] = ofKind(events, "drop");
      return must(first, "the first drop").amount !== must(second, "the second drop").amount;
    });
    expect(differing.length).toBeGreaterThan(seeds.length / 2);
  });
});

describe("rollDrops", () => {
  const hide: Drop = must(MONSTERS.wolf.drops[0], "the wolf's drop");
  const timber = must(RESOURCE_NODES.tree.drops[0], "the tree's drop");
  const at = (levels: Partial<Record<GatheringTrait, number>>) => (trait: GatheringTrait) => levels[trait] ?? 0;

  it("answers the same for the same seed, enemy and levels, and nothing for a trait at level 0", () => {
    expect(rollDrops("s", "tree-1", [timber], at({ woodcutting: 1 }))).toEqual(rollDrops("s", "tree-1", [timber], at({ woodcutting: 1 })));
    expect(rollDrops("s", "tree-1", [timber], at({ mining: 3 }))).toEqual([]);
    expect(rollDrops("s", "tree-1", [], at({ woodcutting: 1 }))).toEqual([]);
  });

  it("rolls a drop by chance about as often as its row says, and always at a row that says always: the wolf's hide, one half the time at skinning 1 and one or two at level 2 (Issue-340)", () => {
    const rolled = (level: number): number[] => seeds.map((seed) => rollDrops(seed, "wolf-1", [hide], at({ skinning: level }))[0]?.amount ?? 0);
    const fell = (level: number): number => rolled(level).filter((amount) => amount > 0).length;
    expect(fell(0)).toBe(0);
    expect(fell(1)).toBeGreaterThan(seeds.length * 0.4);
    expect(fell(1)).toBeLessThan(seeds.length * 0.6);
    expect(new Set(rolled(1))).toEqual(new Set([0, 1]));
    // No unit type skins at level 2 yet, so the row is read here and nowhere in a battle.
    expect(fell(2)).toBe(seeds.length);
    expect(new Set(rolled(2))).toEqual(new Set([1, 2]));
  });

  it("makes one roll for an enemy whatever the level: a higher level reads the same roll against a better row", () => {
    const rolls = seeds.map((seed) => ({
      low: rollDrops(seed, "tree-1", [timber], at({ woodcutting: 1 }))[0]?.amount ?? 0,
      high: rollDrops(seed, "tree-1", [timber], at({ woodcutting: 2 }))[0]?.amount ?? 0,
    }));
    // The same share of each row's range, so the seeds stand in one order at both levels:
    // a seed that rolls more than another at level 1 never rolls less than it at level 2.
    const byLow = sortBy(rolls, ["low", "high"]);
    for (const [a, b] of zip(byLow.slice(0, -1), byLow.slice(1))) expect(b.high, `${a.low} then ${b.low}`).toBeGreaterThanOrEqual(a.high);
    const share = (amount: number, row: DropRow): number => (amount - row.min) / (row.max - row.min + 1);
    for (const { low, high } of rolls) expect(Math.abs(share(low, level1) - share(high, level2))).toBeLessThan(1 / (level1.max - level1.min + 1));
  });

  it("rolls each drop of an enemy the same whether or not the drops before it are gathered", () => {
    for (const seed of seeds) {
      const both = rollDrops(seed, "tree-1", [hide, timber], at({ woodcutting: 1, skinning: 2 }));
      const second = rollDrops(seed, "tree-1", [hide, timber], at({ woodcutting: 1 }));
      expect(second, seed).toEqual(both.filter((d) => d.material === "timber"));
    }
  });
});

describe("The wolf's hide (Issue-340)", () => {
  const drop = must(MONSTERS.wolf.drops[0], "the wolf's drop");
  /** One wolf, met by this party on this seed. */
  const met = (party: readonly PartyMember[], seed: string, content?: BattleContent): BattleOutcome => resolveBattle(setup(party, [opponent("wolf-1", "wolf")], seed), content);
  /** What the wolf's own roll gives a party that skins at level 1, whoever is in it. */
  const rolled = (seed: string): number => rollDrops(seed, "wolf-1", [drop], () => 1)[0]?.amount ?? 0;

  it("falls to a party with a ranger standing: one hide on about half the seeds, as an event after the wolf's fall", () => {
    const outcomes = seeds.map((seed) => ({ seed, outcome: met([hero("fighter-1", "fighter"), hero("ranger-1", "ranger")], seed) }));
    for (const { seed, outcome } of outcomes) {
      expect(outcome.result, seed).toBe("win");
      expect(outcome.drops, seed).toEqual(rolled(seed) > 0 ? { hide: 1 } : {});
      const events = outcome.timeline.events;
      const drops = ofKind(events, "drop");
      expect(drops, seed).toHaveLength(rolled(seed));
      const [first] = drops;
      if (first) {
        expect(first, seed).toMatchObject({ unitId: "wolf-1", material: "hide", amount: 1 });
        expect(events.indexOf(first), seed).toBe(events.findIndex((e) => e.kind === "unit-down" && e.unitId === "wolf-1") + 1);
      }
    }
    const withHide = outcomes.filter((o) => o.outcome.drops.hide).length;
    expect(withHide).toBeGreaterThan(seeds.length * 0.4);
    expect(withHide).toBeLessThan(seeds.length * 0.6);
  });

  it("does not fall to a party that cannot skin, whatever the wolf rolled: a fighter beside a villager, a lumberjack and a miner", () => {
    for (const seed of seeds) {
      const outcome = met([hero("fighter-1", "fighter"), hero("villager-1", "villager"), hero("lumberjack-1", "lumberjack"), hero("miner-1", "miner")], seed);
      expect(outcome.result, seed).toBe("win");
      expect(outcome.drops, seed).toEqual({});
      expect(ofKind(outcome.timeline.events, "drop"), seed).toEqual([]);
    }
    expect(seeds.some((seed) => rolled(seed) > 0)).toBe(true);
  });

  it("does not fall with the ranger down: the wolf takes the ranger, the villager takes the wolf, and nothing drops", () => {
    // The villager starts behind the ranger, so the wolf meets the ranger first; and the wolf only
    // scratches, so that the villager outlives it on every seed and the ranger, at one health, does not.
    const content = contentWith({
      heroes: { villager: { homeLine: "back" } },
      monsters: { wolf: { stats: { ...MONSTERS.wolf.stats, damage: 1 } } },
    });
    for (const seed of seeds) {
      const outcome = met([hero("ranger-1", "ranger", 1), hero("villager-1", "villager")], seed, content);
      expect(outcome.result, seed).toBe("win");
      expect(ofKind(outcome.timeline.events, "unit-down").map((e) => e.unitId), seed).toEqual(["ranger-1", "wolf-1"]);
      expect(outcome.drops, seed).toEqual({});
      expect(ofKind(outcome.timeline.events, "drop"), seed).toEqual([]);
      // The same fight with the ranger at full health, which the scratches do not bring down, gives what the wolf rolled.
      const standing = met([hero("ranger-1", "ranger"), hero("villager-1", "villager")], seed, content);
      expect(standing.drops, seed).toEqual(rolled(seed) > 0 ? { hide: 1 } : {});
    }
  });
});

describe("Enemy XP (decision 0058)", () => {
  it("is the XP of every enemy that went down, a node included, with or without a carrier", () => {
    const party = [hero("villager-1", "villager"), hero("villager-2", "villager")];
    const outcome = resolveBattle(setup(party, [opponent("wolf-1", "wolf"), opponent("tree-1", "tree")]));
    expect(outcome.xp).toBe(MONSTERS.wolf.xp + RESOURCE_NODES.tree.xp);
    expect(fell([hero("fighter-1", "fighter")], "seed-1").xp).toBe(RESOURCE_NODES.tree.xp);
  });

  it("counts only what went down: a battle that runs out of time gives nothing for what still stands", () => {
    const outcome = resolveBattle(setup([hero("villager-1", "villager")], [opponent("tree-1", "tree"), opponent("tree-2", "tree")], "seed-1", 8000));
    expect(outcome.result).toBe("timeout");
    expect(ofKind(outcome.timeline.events, "unit-down")).toEqual([]);
    expect(outcome.xp).toBe(0);
    expect(outcome.drops).toEqual({});
  });
});
