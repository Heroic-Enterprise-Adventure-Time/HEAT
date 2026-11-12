/** The battle engine's hook for the adventure (Issue-112): the retreat. The carry limit went with Issue-283. */

import { describe, expect, it } from "vitest";

import { CombatEngine } from "../../src/index.js";
import { hero, opponent, runAll, setup } from "./helpers.js";

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
