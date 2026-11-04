/** The battle engine's two hooks for the adventure (Issue-112): the retreat and the carry limit. */

import { describe, expect, it } from "vitest";

import { CombatEngine, resolveBattle } from "../../src/index.js";
import { hero, ofKind, opponent, runAll, setup } from "./helpers.js";

describe("Retreat", () => {
  it("ends a battle in progress as a retreat at the given time", () => {
    const engine = new CombatEngine(setup([hero("fighter-1", "fighter")], [opponent("wolf-1", "wolf")]));
    engine.step();
    engine.step();
    const at = engine.getNextEventTime() - 1;
    expect(engine.retreat(at)).toEqual([{ kind: "battle-end", timestamp: at, result: "retreat" }]);
    expect(engine.isComplete()).toBe(true);
    expect(engine.getOutcome()).toMatchObject({ result: "retreat", endedAtMs: at });
  });

  it("refuses a retreat before the start, after the end, or outside the clock and the next event", () => {
    const engine = new CombatEngine(setup([hero("fighter-1", "fighter")], [opponent("wolf-1", "wolf")]));
    expect(() => engine.retreat(0)).toThrow();
    engine.step();
    engine.step();
    expect(() => engine.retreat(engine.getCurrentSimTime() - 1)).toThrow();
    expect(() => engine.retreat(engine.getNextEventTime() + 1)).toThrow();
    runAll(engine);
    expect(() => engine.retreat(engine.getCurrentSimTime())).toThrow();
  });
});

describe("The carry limit", () => {
  it("caps what is gathered and ends the battle as a win once the party is loaded", () => {
    const party = [hero("villager-1", "villager")];
    const trees = [opponent("tree-1", "tree"), opponent("tree-2", "tree")];
    const unlimited = resolveBattle(setup(party, trees));
    expect(unlimited.gathered.timber).toBe(80);

    const loaded = resolveBattle({ ...setup(party, trees), carryLimit: 10 });
    expect(loaded.result).toBe("win");
    expect(loaded.gathered.timber).toBe(10);
    expect(ofKind(loaded.timeline.events, "unit-down")).toEqual([]);
    expect(loaded.endedAtMs).toBeLessThan(unlimited.endedAtMs);
  });

  it("refuses a carry limit that is not a positive whole number", () => {
    const battle = setup([hero("villager-1", "villager")], [opponent("tree-1", "tree")]);
    expect(() => new CombatEngine({ ...battle, carryLimit: 0 })).toThrow();
    expect(() => new CombatEngine({ ...battle, carryLimit: 2.5 })).toThrow();
  });
});
