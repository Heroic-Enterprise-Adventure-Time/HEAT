import { countBy } from "es-toolkit";
import { describe, expect, it } from "vitest";

import { type AdventureResult, JOBS, MONSTERS, must, replay, type SnapshotHero } from "../../src/index.js";
import { haul, ORE, party, rewardOf, SEEDS, seeds, snapshot, TIMBER, villagers, WOLVES } from "./helpers.js";

// Hide and skinning, the first new pair (Issue-340, decision 0058): the wolf
// drops hide to a party with a ranger standing, and nothing to any other. The
// wolves job, two wolves and no node, is where a party goes for it; the
// timber job and the ore job each end in one wolf. No job's description says
// so: not every drop is told.

const wolves = JOBS[WOLVES];
const [level1, level2] = must(MONSTERS.wolf.drops[0], "the wolf's drop").levels;

function played(jobId: string, heroes: readonly SnapshotHero[]) {
  return seeds.map((seed) => ({ seed, result: replay(snapshot(jobId, heroes), seed, []).result }));
}

const hideOf = (result: AdventureResult) => rewardOf(result, "hide");

describe("The wolf's hide on Millbrook's jobs", () => {
  it("is one hide half the time at skinning 1, and one or two always at level 2, which no unit type has yet", () => {
    expect(level1).toEqual({ chancePercent: 50, min: 1, max: 1 });
    expect(level2).toEqual({ chancePercent: 100, min: 1, max: 2 });
  });

  it("is told by no job's description", () => {
    for (const job of Object.values(JOBS)) expect(job.description.toLowerCase(), job.id).not.toMatch(/hide|skin|pelt/);
  });

  it(`comes home with a fighter and a ranger from the wolves job on about three seeds in four of ${SEEDS}: none, one or two hides beside the cloth, with no death`, () => {
    const runs = played(WOLVES, party("fighter", "ranger"));
    for (const { seed, result } of runs) {
      expect(result.outcome, seed).toBe("complete");
      expect(result.dead, seed).toEqual([]);
      const hide = hideOf(result);
      // The pay first, then the hide: a result lists what came home in the resources' order.
      expect(result.rewards, seed).toEqual(hide > 0 ? [...wolves.pay, { material: "hide", amount: hide }] : wolves.pay);
      expect(result.xp.every((x) => x.xp === 20), seed).toBe(true);
    }
    const byHide = countBy(runs, (r) => hideOf(r.result));
    expect(Object.keys(byHide).sort()).toEqual(["0", "1", "2"]);
    // Two wolves, each half the time: none on a quarter of the seeds, one on half and two on a quarter.
    expect(byHide[0]).toBeGreaterThan(SEEDS * 0.18);
    expect(byHide[0]).toBeLessThan(SEEDS * 0.32);
    expect(byHide[1]).toBeGreaterThan(SEEDS * 0.4);
    expect(byHide[1]).toBeLessThan(SEEDS * 0.6);
  });

  for (const heroes of [party("fighter", "villager"), villagers(3), party("fighter", "lumberjack", "miner")]) {
    it(`never comes home without a ranger: ${heroes.map((h) => h.unitType).join(", ")} clear the wolves on every one of ${SEEDS} seeds for the cloth alone`, () => {
      for (const { seed, result } of played(WOLVES, heroes)) {
        expect(result.outcome, seed).toBe("complete");
        expect(result.rewards, seed).toEqual(wolves.pay);
      }
    });
  }

  it("is the same for a seed whoever stands beside the ranger: the roll is the wolf's own", () => {
    const pair = played(WOLVES, party("fighter", "ranger"));
    const three = played(WOLVES, party("ranger", "villager", "villager"));
    for (const [i, { seed, result }] of pair.entries()) expect(hideOf(must(three[i], seed).result), seed).toBe(hideOf(result));
  });

  it("needs one ranger standing, not every ranger: of two, one may fall and the hide still comes home", () => {
    const runs = played(WOLVES, party("ranger", "ranger"));
    for (const { seed, result } of runs) expect(result.outcome, seed).toBe("complete");
    const lostOne = runs.filter((r) => r.result.dead.length === 1);
    expect(lostOne.length).toBeGreaterThan(0);
    expect(lostOne.some((r) => hideOf(r.result) > 0)).toBe(true);
  });

  it("is lost with everything else when the ranger falls last: a ranger beside one villager brings hide home only from the runs it survives", () => {
    const runs = played(WOLVES, party("ranger", "villager"));
    const fell = runs.filter((r) => r.result.dead.includes("ranger-1"));
    expect(fell.length).toBeGreaterThan(0);
    for (const { seed, result } of fell) {
      expect(result.outcome, seed).toBe("defeat");
      expect(result.rewards, seed).toEqual([]);
    }
    expect(runs.some((r) => !r.result.dead.includes("ranger-1") && hideOf(r.result) > 0)).toBe(true);
  });

  for (const [jobId, material, type] of [[TIMBER, "timber", "tree"], [ORE, "ore", "ore-vein"]] as const) {
    it(`comes home from ${JOBS[jobId].name} too, which ends in one wolf: a ranger with two villagers brings one hide on about half of ${SEEDS} seeds, beside all the ${material}`, () => {
      const staple = haul(type, 1, 2);
      const runs = played(jobId, party("ranger", "villager", "villager"));
      for (const { seed, result } of runs) {
        expect(result.outcome, seed).toBe("complete");
        expect(result.dead, seed).toEqual([]);
        expect(rewardOf(result, material), seed).toBeGreaterThanOrEqual(staple.min);
        expect(rewardOf(result, material), seed).toBeLessThanOrEqual(staple.max);
        expect(hideOf(result), seed).toBeLessThanOrEqual(1);
      }
      const withHide = runs.filter((r) => hideOf(r.result) === 1).length;
      expect(withHide).toBeGreaterThan(SEEDS * 0.4);
      expect(withHide).toBeLessThan(SEEDS * 0.6);
      // Villagers alone bring none.
      for (const { seed, result } of played(jobId, villagers(2))) expect(hideOf(result), seed).toBe(0);
    });
  }
});
