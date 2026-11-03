/**
 * Adapted from BattleScript Online, bso-game-shared/src/combat/resolution.test.ts:
 * the `getReachableLines`, `isAbilityUsable` and `selectAction` cases that
 * survive decision 0030, with the resource-node passes and guard new.
 */

import { range } from "es-toolkit";
import { describe, expect, it } from "vitest";

import {
  ABILITIES,
  type ActionContext,
  getReachableLines,
  isAbilityUsable,
  type Line,
  SeededRng,
  selectAction,
  type Side,
  targetCandidates,
  type UnitKind,
  type UnitState,
} from "../../src/index.js";

function unit(unitId: string, side: Side, line: Line, extra: Partial<UnitState> & { kind?: UnitKind } = {}): UnitState {
  return {
    unitId,
    kind: "hero",
    type: "villager",
    side,
    stats: { maxHealth: 30, speed: 10, damage: 4, gathering: 4 },
    actions: [],
    acts: true,
    health: 30,
    line,
    chargeTimer: 1000,
    currentAction: null,
    guard: null,
    alive: true,
    ...extra,
  };
}

const wolf = (id: string, line: Line, health = 24): UnitState => unit(id, "opponents", line, { kind: "monster", type: "wolf", health });
const tree = (id: string): UnitState =>
  unit(id, "opponents", "front", { kind: "resource", type: "tree", material: "timber", acts: false, health: 40 });
const vein = (id: string): UnitState =>
  unit(id, "opponents", "front", { kind: "resource", type: "ore-vein", material: "ore", acts: false, health: 40 });

function context(actor: UnitState, others: readonly UnitState[], clock = 0): ActionContext {
  const all = [actor, ...others];
  return {
    actor,
    allies: all.filter((u) => u.side === actor.side),
    opponents: all.filter((u) => u.side !== actor.side),
    clock,
  };
}

const villagerList = [ABILITIES.strike, ABILITIES.chop, ABILITIES.mine, ABILITIES["move-up"]];

describe("getReachableLines", () => {
  it("returns the target lines for the actor's line", () => {
    expect(getReachableLines(ABILITIES.strike, "front")).toEqual(["front"]);
    expect(getReachableLines(ABILITIES["strike-weakest"], "front")).toEqual(["front", "near"]);
  });

  it("returns null from a line with no reach", () => {
    expect(getReachableLines(ABILITIES.strike, "near")).toBeNull();
  });

  it("returns null for a self-targeted ability", () => {
    expect(getReachableLines(ABILITIES["move-up"], "near")).toBeNull();
  });
});

describe("isAbilityUsable", () => {
  it("needs the actor on a line with reach", () => {
    const actor = unit("v", "party", "near");
    expect(isAbilityUsable(ABILITIES.strike, context(actor, [wolf("w", "front")]))).toBe(false);
    actor.line = "front";
    expect(isAbilityUsable(ABILITIES.strike, context(actor, [wolf("w", "front")]))).toBe(true);
  });

  it("needs a living target on a reachable line", () => {
    const actor = unit("v", "party", "front");
    expect(isAbilityUsable(ABILITIES.strike, context(actor, [wolf("w", "near")]))).toBe(false);
    expect(isAbilityUsable(ABILITIES.strike, context(actor, [{ ...wolf("w", "front"), alive: false }]))).toBe(false);
  });

  it("allows move up anywhere but the front line", () => {
    expect(isAbilityUsable(ABILITIES["move-up"], context(unit("v", "party", "near"), []))).toBe(true);
    expect(isAbilityUsable(ABILITIES["move-up"], context(unit("v", "party", "front"), []))).toBe(false);
  });

  it("gathers only from its own kind of node", () => {
    const actor = unit("v", "party", "front");
    expect(isAbilityUsable(ABILITIES.chop, context(actor, [tree("t")]))).toBe(true);
    expect(isAbilityUsable(ABILITIES.chop, context(actor, [vein("o")]))).toBe(false);
    expect(isAbilityUsable(ABILITIES.mine, context(actor, [vein("o")]))).toBe(true);
    expect(isAbilityUsable(ABILITIES.chop, context(actor, [wolf("w", "front")]))).toBe(false);
  });

  it("lets a regular attack reach a resource node, in the second pass only", () => {
    const ctx = context(unit("f", "party", "front"), [tree("t")]);
    expect(targetCandidates(ABILITIES.strike, ctx, "units")).toEqual([]);
    expect(targetCandidates(ABILITIES.strike, ctx, "resources").map((u) => u.unitId)).toEqual(["t"]);
    expect(isAbilityUsable(ABILITIES.strike, ctx)).toBe(true);
  });

  it("guards only an ally below half health, and not while a guard holds", () => {
    const fighter = unit("f", "party", "front");
    const ally = unit("v", "party", "near", { health: 15 });
    expect(isAbilityUsable(ABILITIES.guard, context(fighter, [ally]))).toBe(false);
    ally.health = 14;
    expect(isAbilityUsable(ABILITIES.guard, context(fighter, [ally]))).toBe(true);
    fighter.guard = { allyId: "v", until: 4000 };
    expect(isAbilityUsable(ABILITIES.guard, context(fighter, [ally], 3999))).toBe(false);
    expect(isAbilityUsable(ABILITIES.guard, context(fighter, [ally], 4000))).toBe(true);
  });

  it("never guards itself", () => {
    const fighter = unit("f", "party", "front", { health: 1 });
    expect(isAbilityUsable(ABILITIES.guard, context(fighter, []))).toBe(false);
  });
});

describe("selectAction", () => {
  it("takes the first usable ability in the list", () => {
    const actor = unit("v", "party", "front");
    const selection = selectAction(villagerList, context(actor, [wolf("w", "front"), tree("t")]), new SeededRng("s"));
    expect(selection?.ability.abilityId).toBe("strike");
    expect(selection?.target.unitId).toBe("w");
  });

  it("prefers a gather ability on a node to a regular attack on it", () => {
    const actor = unit("v", "party", "front");
    const selection = selectAction(villagerList, context(actor, [tree("t")]), new SeededRng("s"));
    expect(selection?.ability.abilityId).toBe("chop");
  });

  it("prefers moving up to striking a resource node", () => {
    const actor = unit("b", "party", "near");
    const list = [ABILITIES.strike, ABILITIES["move-up"]];
    expect(selectAction(list, context(actor, [tree("t")]), new SeededRng("s"))?.ability.abilityId).toBe("move-up");
  });

  it("falls back to a regular attack on a node when nothing else is usable", () => {
    const actor = unit("f", "party", "front");
    const selection = selectAction([ABILITIES.guard, ABILITIES.strike], context(actor, [tree("t")]), new SeededRng("s"));
    expect(selection?.ability.abilityId).toBe("strike");
    expect(selection?.target.unitId).toBe("t");
  });

  it("returns undefined when nothing is usable", () => {
    expect(selectAction([ABILITIES.strike], context(unit("v", "party", "near"), [wolf("w", "front")]), new SeededRng("s"))).toBeUndefined();
  });

  it("strikes the weakest across the lines it reaches", () => {
    const actor = unit("b", "opponents", "front", { kind: "monster" });
    const targets = [unit("a", "party", "front", { health: 20 }), unit("c", "party", "near", { health: 5 }), unit("d", "party", "far", { health: 1 })];
    const selection = selectAction([ABILITIES["strike-weakest"]], context(actor, targets), new SeededRng("s"));
    expect(selection?.target.unitId).toBe("c");
  });

  it("guards the ally with the lowest share of its health", () => {
    const fighter = unit("f", "party", "front");
    const a = unit("a", "party", "near", { health: 10 });
    const b = unit("b", "party", "near", { health: 5, stats: { maxHealth: 12, speed: 10, damage: 1, gathering: 0 } });
    expect(selectAction([ABILITIES.guard], context(fighter, [a, b]), new SeededRng("s"))?.target.unitId).toBe("a");
  });

  it("breaks a tie within a line with the seeded generator, the same way for the same seed", () => {
    const actor = unit("v", "party", "front");
    const pick = (seed: string): string | undefined =>
      selectAction([ABILITIES.strike], context(actor, [wolf("w1", "front"), wolf("w2", "front")]), new SeededRng(seed))?.target.unitId;
    expect(pick("s")).toBe(pick("s"));
    const picks = new Set(range(20).map((i) => pick(`s${String(i)}`)));
    expect(picks).toEqual(new Set(["w1", "w2"]));
  });

  it("draws from the generator only to break a tie", () => {
    const rng = new SeededRng("s");
    const control = new SeededRng("s");
    selectAction(villagerList, context(unit("v", "party", "near"), [wolf("w", "front")]), rng);
    expect(rng.next()).toBe(control.next());
  });
});
