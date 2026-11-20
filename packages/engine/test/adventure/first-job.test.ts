import { describe, expect, it } from "vitest";

import { AdventureEngine, type AdventureResult, JOBS, jobsPostedBy, location, replay, STARTING_LOCATION } from "../../src/index.js";
import { haul, hero, rewardOf, SEEDS, seeds, snapshot, STICKS, TIMBER, WOLVES } from "./helpers.js";

// The first progression (decision 0031, with the hauls of decision 0058): a
// new player's free villager cannot fail "Pick up sticks", and one run pays
// for the next villager at its worst roll.

const lone = [hero("villager-1", "villager")];
const sticks = JOBS[STICKS];
const gather = sticks.stages[1];
if (gather?.kind !== "gather") throw new Error("The sticks job gathers second");
/** What a villager brings home from the one tree: its drop at woodcutting 1. */
const VILLAGER_TREE = haul("tree", 1);
/** What the next villager costs. */
const VILLAGER_COST = 20;

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
  });

  it(`is completed by a lone villager on every one of ${SEEDS} seeds, felling the tree for 30 to 36 timber and 5 XP, with no damage taken`, () => {
    expect(VILLAGER_TREE).toEqual({ min: 30, max: 36 });
    for (const seed of seeds) {
      const { result } = replay(snapshot(STICKS, lone), seed, []);
      expect(result.outcome, seed).toBe("complete");
      expect(result.dead, seed).toEqual([]);
      expect(result.health, seed).toEqual([{ heroId: "villager-1", health: lone[0]?.stats.maxHealth }]);
      expect(result.rewards.map((r) => r.material), seed).toEqual(["timber"]);
      expect(rewardOf(result, "timber"), seed).toBeGreaterThanOrEqual(VILLAGER_TREE.min);
      expect(rewardOf(result, "timber"), seed).toBeLessThanOrEqual(VILLAGER_TREE.max);
      expect(result.xp, seed).toEqual([{ heroId: "villager-1", xp: 5 }]);
    }
  });

  it(`stays complete, well inside its time limit and for the very same timber, when the villager is forced to swing every turn, on ${SEEDS} seeds`, () => {
    for (const seed of seeds) {
      const result = swingingEveryTurn(seed);
      expect(result.outcome, seed).toBe("complete");
      expect(result.dead, seed).toEqual([]);
      // The tree's roll is its own: nothing forced in the fight moves it (decision 0058).
      expect(result.rewards, seed).toEqual(replay(snapshot(STICKS, lone), seed, []).result.rewards);
      const stage = result.stages[1];
      expect(stage?.ended, seed).not.toBe("timeout");
      expect((stage?.endedAtMs ?? Infinity) - (stage?.startedAtMs ?? 0), seed).toBeLessThan(gather.timeLimitMs / 1.5);
    }
  });

  it("pays for the next villager in one run, at its worst roll", () => {
    const villager = location(STARTING_LOCATION)?.recruits.find((r) => r.unitType === "villager");
    expect(villager?.cost).toEqual([{ material: "timber", amount: VILLAGER_COST }]);
    expect(VILLAGER_TREE.min).toBeGreaterThanOrEqual(VILLAGER_COST);
  });

  it(`brings a hero who cannot cut wood nothing but the XP: a lone fighter or miner completes it with no timber, on ${SEEDS} seeds`, () => {
    for (const unitType of ["fighter", "miner"] as const) {
      for (const seed of seeds) {
        const { result } = replay(snapshot(STICKS, [hero("h", unitType)]), seed, []);
        expect(result.outcome, `${unitType} ${seed}`).toBe("complete");
        expect(result.rewards, `${unitType} ${seed}`).toEqual([]);
        expect(result.xp, `${unitType} ${seed}`).toEqual([{ heroId: "h", xp: 5 }]);
      }
    }
  });
});
