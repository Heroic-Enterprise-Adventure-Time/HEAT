import { describe, expect, it } from "vitest";

import { FACILITIES, JOBS, replay, WAREHOUSE_CAPACITY } from "../../src/index.js";
import { battleStage, haul, party, rewardOf, SEEDS, seeds, snapshot, TIMBER, villagers } from "./helpers.js";

// The villagers' timber run (decision 0031, with the hauls of decision 0058):
// one run of it pays for the mine, at its worst roll.

const timber = JOBS[TIMBER];
const gather = battleStage(timber, "gather");
/** What villagers bring home from the two trees: each tree's drop at woodcutting 1. */
const VILLAGERS_TIMBER = haul("tree", 1, 2);

describe("Timber from the near woods", () => {
  it("gathers from 2 trees, then fights a wolf", () => {
    expect(timber.stages.map((s) => s.kind)).toEqual(["travel", "gather", "fight", "arrive"]);
    expect(gather.opponents).toEqual([{ type: "tree", count: 2 }]);
  });

  for (const count of [1, 2, 3]) {
    it(`is completed by ${count} villager(s) on every one of ${SEEDS} seeds, with 60 to 72 timber, its pay, 15 XP and no death`, () => {
      expect(VILLAGERS_TIMBER).toEqual({ min: 60, max: 72 });
      const heroes = villagers(count);
      for (const seed of seeds) {
        const { result } = replay(snapshot(TIMBER, heroes), seed, []);
        expect(result.outcome, seed).toBe("complete");
        expect(result.dead, seed).toEqual([]);
        expect(result.rewards, seed).toEqual([{ material: "timber", amount: rewardOf(result, "timber") }, ...timber.pay]);
        expect(rewardOf(result, "timber"), seed).toBeGreaterThanOrEqual(VILLAGERS_TIMBER.min);
        expect(rewardOf(result, "timber"), seed).toBeLessThanOrEqual(VILLAGERS_TIMBER.max);
        expect(result.xp.every((x) => x.xp === 15), seed).toBe(true);
      }
    });
  }

  it(`brings a fighter with a villager what villagers bring, on every one of ${SEEDS} seeds: one carrier is enough, and a fighter's hits cost nothing`, () => {
    for (const seed of seeds) {
      const mixed = replay(snapshot(TIMBER, party("fighter", "villager")), seed, []).result;
      expect(mixed.outcome, seed).toBe("complete");
      expect(mixed.rewards, seed).toEqual(replay(snapshot(TIMBER, villagers(2)), seed, []).result.rewards);
    }
  });

  it("pays for the mine in one run, at its worst roll", () => {
    expect(FACILITIES.mine.levels[0]?.cost).toEqual([{ material: "timber", amount: VILLAGERS_TIMBER.min }, ...timber.pay]);
  });

  it("brings home no more than a level-1 warehouse holds, even at a lumberjack's best roll", () => {
    expect(haul("tree", 2, 2).max).toBeLessThanOrEqual(WAREHOUSE_CAPACITY[0] ?? 0);
  });
});
