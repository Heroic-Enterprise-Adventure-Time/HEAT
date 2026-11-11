import { range } from "es-toolkit";
import { describe, expect, it } from "vitest";

import { FACILITIES, JOBS, replay, RESOURCE_NODES, WAREHOUSE_CAPACITY } from "../../src/index.js";
import { hero, SEEDS, seeds, snapshot, TIMBER } from "./helpers.js";

// The villagers' timber run (decision 0031, as retuned by decision 0051):
// one run of it pays for the mine.

const timber = JOBS[TIMBER];
const gather = timber.stages[1];
if (gather?.kind !== "gather") throw new Error("The timber job gathers second");
/** What villagers bring home from the two trees: a rating of 2 against 3, two thirds of each tree's 45. */
const VILLAGERS_TIMBER = 60;

describe("Timber from the near woods", () => {
  it("gathers from 2 trees, then fights a wolf", () => {
    expect(timber.stages.map((s) => s.kind)).toEqual(["travel", "gather", "fight", "arrive"]);
    expect(gather.opponents).toEqual([{ type: "tree", count: 2 }]);
  });

  for (const count of [1, 2, 3]) {
    it(`is completed by ${count} villager(s) on every one of ${SEEDS} seeds, with 60 timber, its pay and no death`, () => {
      const party = range(count).map((i) => hero(`villager-${i + 1}`, "villager"));
      for (const seed of seeds) {
        const { result } = replay(snapshot(TIMBER, party), seed, []);
        expect(result.outcome, seed).toBe("complete");
        expect(result.dead, seed).toEqual([]);
        expect(result.rewards, seed).toEqual([{ material: "timber", amount: VILLAGERS_TIMBER }, ...timber.pay]);
      }
    });
  }

  it("pays for the mine in one run", () => {
    expect(FACILITIES.mine.levels[0]?.cost).toEqual([{ material: "timber", amount: VILLAGERS_TIMBER }, ...timber.pay]);
  });

  it("brings home no more than a level-1 warehouse holds, even harvested in full", () => {
    const ceiling = 2 * RESOURCE_NODES.tree.maxYield;
    expect(ceiling).toBeLessThanOrEqual(WAREHOUSE_CAPACITY[0] ?? 0);
  });
});
