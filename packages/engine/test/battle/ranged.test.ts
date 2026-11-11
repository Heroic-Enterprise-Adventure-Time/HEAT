/**
 * Ranged units (Issue-286, decision 0052): the ranger's shot and the goblin
 * rock thrower's throw reach every line from every line, where melee reaches
 * only the front; monsters are shot before nodes, and a node last of all.
 */

import { describe, expect, it } from "vitest";

import { ABILITIES, CombatEngine, getReachableLines, LINES, MONSTERS, must, RESOURCE_NODES, UNIT_PROFILES } from "../../src/index.js";
import { hero, ofKind, opponent, runAll, setup } from "./helpers.js";

const RANGED = [ABILITIES.shoot, ABILITIES["throw-rock"]];

describe("Reach by line", () => {
  for (const ability of RANGED) {
    it(`${ability.name} reaches every line of the other side from every line of its own`, () => {
      for (const line of LINES) expect(getReachableLines(ability, line)).toEqual(LINES);
    });
  }

  it("leaves melee where it was: a strike reaches the front line from the front line, and nothing from behind", () => {
    expect(getReachableLines(ABILITIES.strike, "front")).toEqual(["front"]);
    for (const line of ["near", "far", "back"] as const) expect(getReachableLines(ABILITIES.strike, line)).toBeNull();
  });

  it("stands the ranger and the goblin on a rear line, each with its one ranged action", () => {
    expect(UNIT_PROFILES.ranger).toMatchObject({ homeLine: "far", actions: ["shoot"] });
    expect(MONSTERS["goblin-rock-thrower"]).toMatchObject({ homeLine: "far", actions: ["throw-rock"] });
  });
});

describe("A goblin behind a vein", () => {
  const opponents = [opponent("vein-1", "ore-vein"), opponent("goblin-1", "goblin-rock-thrower")];

  it("is out of a villager's reach until the vein falls and its side moves up", () => {
    const events = runAll(new CombatEngine(setup([hero("villager-1", "villager"), hero("villager-2", "villager"), hero("villager-3", "villager")], opponents)));
    const veinDown = must(ofKind(events, "unit-down").find((e) => e.unitId === "vein-1"), "the vein's fall");
    const resolved = ofKind(events, "action-resolved");
    const hitsOnGoblin = resolved.filter((e) => e.effects.some((f) => f.kind === "damage" && f.targetId === "goblin-1"));
    expect(hitsOnGoblin.length).toBeGreaterThan(0);
    for (const hit of hitsOnGoblin) expect(hit.timestamp).toBeGreaterThanOrEqual(veinDown.timestamp);
    // The vein's fall empties the front line, and the goblin is moved up to it.
    const collapse = must(ofKind(events, "line-collapsed").find((e) => e.side === "opponents" && e.timestamp === veinDown.timestamp), "the collapse");
    expect(collapse.moves).toContainEqual({ unitId: "goblin-1", from: "far", to: "near" });
    // Meanwhile it threw from where it stood, over the vein.
    const throws = ofKind(events, "action-declared").filter((e) => e.unitId === "goblin-1" && e.timestamp < veinDown.timestamp);
    expect(throws.length).toBeGreaterThan(0);
    expect(throws.every((e) => e.abilityId === "throw-rock")).toBe(true);
  });

  it("is shot by a ranger from the far line while the vein still stands, before the ranger ever shoots the vein", () => {
    const events = runAll(new CombatEngine(setup([hero("ranger-1", "ranger"), hero("villager-1", "villager")], opponents)));
    const shots = ofKind(events, "action-declared").filter((e) => e.unitId === "ranger-1");
    const goblinDown = must(ofKind(events, "unit-down").find((e) => e.unitId === "goblin-1"), "the goblin's fall");
    const veinDown = must(ofKind(events, "unit-down").find((e) => e.unitId === "vein-1"), "the vein's fall");
    expect(goblinDown.timestamp).toBeLessThan(veinDown.timestamp);
    expect(must(shots[0], "the first shot").targetIds).toEqual(["goblin-1"]);
    for (const shot of shots.filter((e) => e.timestamp < goblinDown.timestamp)) expect(shot.targetIds).toEqual(["goblin-1"]);
  });

  it("leaves the ranger the vein once the goblin is down, and its shots waste what they take (the owner's call)", () => {
    const events = runAll(new CombatEngine(setup([hero("ranger-1", "ranger")], opponents)));
    const harvests = ofKind(events, "action-resolved")
      .filter((e) => e.unitId === "ranger-1")
      .flatMap((e) => e.effects.filter((f) => f.kind === "harvest"));
    expect(harvests.length).toBeGreaterThan(0);
    expect(harvests.every((f) => f.yield === 0)).toBe(true);
    expect(must(ofKind(events, "battle-end")[0], "the end").result).toBe("win");
  });
});

describe("A goblin's throw", () => {
  it("lands on the closest line: the villager at the front, not the ranger behind it", () => {
    const party = [hero("ranger-1", "ranger"), hero("villager-1", "villager")];
    const events = runAll(new CombatEngine(setup(party, [opponent("vein-1", "ore-vein"), opponent("goblin-1", "goblin-rock-thrower")])));
    const throws = ofKind(events, "action-declared").filter((e) => e.unitId === "goblin-1");
    expect(throws.length).toBeGreaterThan(0);
    // The villager starts on the near line and is the party's front once the lines close up; the ranger stays behind it.
    expect(throws.every((e) => e.targetIds[0] === "villager-1")).toBe(true);
  });

  it("does the goblin's damage after its warmup", () => {
    const events = runAll(new CombatEngine(setup([hero("ranger-1", "ranger")], [opponent("goblin-1", "goblin-rock-thrower")])));
    const declared = must(ofKind(events, "action-declared").find((e) => e.unitId === "goblin-1"), "a throw");
    expect(declared.resolveTimestamp - declared.timestamp).toBe(ABILITIES["throw-rock"].warmupMs);
    const resolved = must(ofKind(events, "action-resolved").find((e) => e.unitId === "goblin-1"), "a throw landing");
    expect(resolved.effects).toEqual([{ kind: "damage", targetId: "ranger-1", amount: MONSTERS["goblin-rock-thrower"].stats.damage, newHealth: expect.any(Number) as number }]);
  });

  it("gives neither ranged unit a gather rating", () => {
    for (const node of Object.values(RESOURCE_NODES)) {
      expect(must(UNIT_PROFILES.ranger, "the ranger").stats.gather.find((g) => g.material === node.material)).toBeUndefined();
    }
    expect(MONSTERS["goblin-rock-thrower"].stats.gather).toEqual([]);
  });
});
