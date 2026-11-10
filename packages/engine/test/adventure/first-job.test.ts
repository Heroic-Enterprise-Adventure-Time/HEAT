import { range } from "es-toolkit";
import { describe, expect, it } from "vitest";

import { AdventureEngine, type AdventureResult, JOBS, jobsPostedBy, location, replay, RESOURCE_NODES, STARTING_LOCATION } from "../../src/index.js";
import { hero, snapshot, STICKS, TIMBER, WOLVES } from "./helpers.js";

// The first progression (decision 0031, as retuned by decision 0051): a new
// player's free villager cannot fail "Pick up sticks", and one run pays for
// the next villager.

const SEEDS = 500;
const seeds = range(SEEDS).map((i) => `seed-${i}`);
const lone = [hero("villager-1", "villager")];
const sticks = JOBS[STICKS];
const gather = sticks.stages[1];
if (gather?.kind !== "gather") throw new Error("The sticks job gathers second");
/** What a villager brings home from one tree: its rating of 2 against the tree's 3, two thirds of 45. */
const VILLAGER_TREE = 30;

/** The worst a player can do with forced actions: make the villager swing at the tree every turn. */
function swingingEveryTurn(seed: string): AdventureResult {
  const engine = new AdventureEngine(snapshot(STICKS, lone), seed);
  while (!engine.isComplete()) {
    engine.submitOverride("villager-1", { kind: "force-action", abilityId: "strike" });
    engine.step();
  }
  return engine.getResult();
}

describe("Pick up sticks", () => {
  it("is first on Millbrook's board, before the timber and the wolves jobs", () => {
    const board = jobsPostedBy(STARTING_LOCATION, "job-board").map((j) => j.id);
    expect(board).toEqual([STICKS, TIMBER, WOLVES]);
  });

  it("has one tree to fell and no monster", () => {
    expect(sticks.stages.map((s) => s.kind)).toEqual(["travel", "gather", "arrive"]);
    expect(gather.opponents).toEqual([{ type: "tree", count: 1 }]);
    expect(RESOURCE_NODES.tree.maxYield).toBeGreaterThan(VILLAGER_TREE);
  });

  it(`is completed by a lone villager on every one of ${SEEDS} seeds, felling the tree for 30 timber, with no damage taken`, () => {
    for (const seed of seeds) {
      const { result } = replay(snapshot(STICKS, lone), seed, []);
      expect(result.outcome, seed).toBe("complete");
      expect(result.dead, seed).toEqual([]);
      expect(result.health, seed).toEqual([{ heroId: "villager-1", health: lone[0]?.stats.maxHealth }]);
      expect(result.rewards, seed).toEqual([{ material: "timber", amount: VILLAGER_TREE }]);
      expect(result.xp, seed).toEqual([{ heroId: "villager-1", xp: sticks.xp }]);
    }
  });

  it(`stays complete, well inside its time limit and for the same timber, when the villager is forced to swing every turn, on ${SEEDS} seeds`, () => {
    for (const seed of seeds) {
      const result = swingingEveryTurn(seed);
      expect(result.outcome, seed).toBe("complete");
      expect(result.dead, seed).toEqual([]);
      expect(result.rewards, seed).toEqual([{ material: "timber", amount: VILLAGER_TREE }]);
      const stage = result.stages[1];
      expect(stage?.ended, seed).not.toBe("timeout");
      expect((stage?.endedAtMs ?? Infinity) - (stage?.startedAtMs ?? 0), seed).toBeLessThan(gather.timeLimitMs / 1.5);
    }
  });

  it("pays for the next villager in one run", () => {
    const villager = location(STARTING_LOCATION)?.recruits.find((r) => r.unitType === "villager");
    expect(villager?.cost).toEqual([{ material: "timber", amount: 20 }]);
    expect(VILLAGER_TREE).toBeGreaterThanOrEqual(20);
  });
});
