import { countBy } from "es-toolkit";
import { describe, expect, it } from "vitest";

import {
  type AdventureResult,
  countRange,
  expandStages,
  FACILITIES,
  JOB_WAREHOUSE_LEVEL,
  JOBS,
  jobsPostedBy,
  location,
  MONSTERS,
  must,
  replay,
  RESOURCE_NODES,
  type SnapshotHero,
  STARTING_LOCATION,
  warehouseCapacity,
} from "../../src/index.js";
import { atLargest, contentWithJob, haul, LUMBER, party, played, rewardOf, SEEDS, seeds, snapshot, TIMBER, villagers } from "./helpers.js";

// The lumber camp's first job (Issue-291), the first written for decision
// 0058's shape: three trees or four, and on half its runs a wolf or two among
// them. The puzzle is a party that covers what may show up, a woodcutter for
// the trees and a skinner for the wolves, and survives it. Every party here
// is played over the same seeds, and what it brings home is a range.

const lumber = JOBS[LUMBER];
const stage = lumber.stages[1];
if (stage?.kind !== "gather") throw new Error("The lumber job gathers second");
const [trees, wolves] = stage.opponents;
if (trees?.type !== "tree" || wolves?.type !== "wolf") throw new Error("The lumber job lists its trees, then its wolves");
const TREES = countRange(trees.count);
/** The board's timber job, which this one is to beat: its gather, and the most trees it rolls. */
const boardGather = JOBS[TIMBER].stages[1];
if (boardGather?.kind !== "gather") throw new Error("The timber job gathers second");
const BOARD_TREES = countRange(must(boardGather.opponents[0], "the timber job's trees").count).max;
const WOLVES = countRange(wolves.count);

/** What one adventure of the job meets: its trees and its wolves, as its seed rolls them. */
function rolled(seed: string): { readonly trees: number; readonly wolves: number } {
  const opponents = expandStages(lumber, seed).flatMap((s) => (s.kind === "gather" ? s.opponents : []));
  const count = (type: string) => opponents.find((o) => o.type === type)?.count ?? 0;
  return { trees: count("tree"), wolves: count("wolf") };
}

const timberOf = (result: AdventureResult) => rewardOf(result, "timber");
const hideOf = (result: AdventureResult) => rewardOf(result, "hide");

/** The XP a survivor earns from this roll: every enemy's, and the bonus. */
function xpOf(seed: string): number {
  const { trees: t, wolves: w } = rolled(seed);
  return t * RESOURCE_NODES.tree.xp + w * MONSTERS.wolf.xp + lumber.bonusXp;
}

/** The party completes the job on every seed with nobody lost, for the timber its trees drop at this level of woodcutting. */
function expectSafe(heroes: readonly SnapshotHero[], level: number): void {
  for (const { seed, result } of played(LUMBER, heroes)) {
    const timber = haul("tree", level, rolled(seed).trees);
    expect(result.outcome, seed).toBe("complete");
    expect(result.dead, seed).toEqual([]);
    expect(timberOf(result), seed).toBeGreaterThanOrEqual(timber.min);
    expect(timberOf(result), seed).toBeLessThanOrEqual(timber.max);
    expect(result.xp.every((x) => x.xp === xpOf(seed)), seed).toBe(true);
  }
}

describe("Lumber from the deep woods", () => {
  it("is posted by Millbrook's lumber camp, its one job, and not by the job board", () => {
    expect(lumber.facility).toBe("lumber-camp");
    expect(FACILITIES["lumber-camp"].levels.length).toBeGreaterThan(0);
    expect(jobsPostedBy(STARTING_LOCATION, "lumber-camp").map((j) => j.id)).toEqual([LUMBER]);
    expect(jobsPostedBy(STARTING_LOCATION, "job-board").map((j) => j.id)).not.toContain(LUMBER);
  });

  it("is three trees or four, and half the time a wolf or two among them, with no pay", () => {
    expect(lumber.stages.map((s) => s.kind)).toEqual(["travel", "gather", "arrive"]);
    expect(stage.opponents).toEqual([{ type: "tree", count: { min: 3, max: 4 } }, { type: "wolf", count: { min: 1, max: 2 }, chancePercent: 50 }]);
    expect(lumber.pay).toEqual([]);
  });

  it(`rolls each of its six adventures on some of ${SEEDS} seeds: wolves on about half, and three trees about as often as four`, () => {
    const rolls = seeds.map(rolled);
    const kinds = countBy(rolls, (r) => `${r.trees} trees, ${r.wolves} wolves`);
    expect(Object.keys(kinds).sort()).toEqual(
      [TREES.min, TREES.max].flatMap((t) => [0, WOLVES.min, WOLVES.max].map((w) => `${t} trees, ${w} wolves`)).sort(),
    );
    const withWolves = rolls.filter((r) => r.wolves > 0).length;
    expect(withWolves).toBeGreaterThan(SEEDS / 2 - 50);
    expect(withWolves).toBeLessThan(SEEDS / 2 + 50);
    const fourTrees = rolls.filter((r) => r.trees === TREES.max).length;
    expect(fourTrees).toBeGreaterThan(SEEDS / 2 - 50);
    expect(fourTrees).toBeLessThan(SEEDS / 2 + 50);
  });

  it("gives a survivor 15 XP at its least roll, as the mine's first job gives, and 28 at its largest", () => {
    expect(TREES.min * RESOURCE_NODES.tree.xp + lumber.bonusXp).toBe(15);
    expect(TREES.max * RESOURCE_NODES.tree.xp + WOLVES.max * MONSTERS.wolf.xp + lumber.bonusXp).toBe(28);
  });

  it("brings home clearly more timber than the board's timber job: its worst roll beats that job's best, for villagers and for a lumberjack", () => {
    expect(haul("tree", 1, TREES.min).min).toBeGreaterThan(haul("tree", 1, BOARD_TREES).max);
    expect(haul("tree", 2, TREES.min).min).toBeGreaterThan(haul("tree", 2, BOARD_TREES).max);
    expect([haul("tree", 1, TREES.min).min, haul("tree", 1, TREES.max).max]).toEqual([90, 144]);
    expect([haul("tree", 2, TREES.min).min, haul("tree", 2, TREES.max).max]).toEqual([126, 200]);
  });

  it("passes a level-1 warehouse and fits a level-2 one at a lumberjack's best roll, which the owner accepted (decision 0058)", () => {
    const most = haul("tree", 2, TREES.max).max;
    expect(JOB_WAREHOUSE_LEVEL[LUMBER]).toBe(2);
    expect(most).toBeGreaterThan(warehouseCapacity(1));
    expect(most).toBeLessThanOrEqual(warehouseCapacity(2));
  });

  for (const count of [3, 4]) {
    it(`is completed by ${count} villagers on every one of ${SEEDS} seeds with no death, for 90 to 144 timber by its trees and every enemy's XP`, () => {
      expectSafe(villagers(count), 1);
    });
  }

  it(`is completed by a fighter with a villager on every one of ${SEEDS} seeds with no death, for the timber villagers bring`, () => {
    expectSafe(party("fighter", "villager"), 1);
  });

  it(`is completed by a lumberjack with a fighter on every one of ${SEEDS} seeds with no death, for 126 to 200 timber by its trees, and no hide`, () => {
    const heroes = party("lumberjack", "fighter");
    expectSafe(heroes, 2);
    for (const { seed, result } of played(LUMBER, heroes)) expect(hideOf(result), seed).toBe(0);
  });

  it(`is completed by a lumberjack, a fighter and a ranger on every one of ${SEEDS} seeds with no death, for the same timber and a hide from some of its wolves: the party that covers every drop`, () => {
    const heroes = party("lumberjack", "fighter", "ranger");
    expectSafe(heroes, 2);
    const without = played(LUMBER, party("lumberjack", "fighter"));
    let hides = 0;
    let wolvesMet = 0;
    played(LUMBER, heroes).forEach(({ seed, result }, i) => {
      // A tree's roll is its own, so the ranger changes nothing of the timber.
      expect(timberOf(result), seed).toBe(timberOf(must(without[i], seed).result));
      // At skinning 1 a wolf leaves one hide, half the time.
      expect(hideOf(result), seed).toBeLessThanOrEqual(rolled(seed).wolves);
      hides += hideOf(result);
      wolvesMet += rolled(seed).wolves;
    });
    expect(hides).toBeGreaterThan(wolvesMet / 2 - 50);
    expect(hides).toBeLessThan(wolvesMet / 2 + 50);
  });

  it(`is completed by a lumberjack with a fighter at its largest roll, four trees and two wolves, on every one of ${SEEDS} seeds with no death`, () => {
    const largest = atLargest(lumber);
    const content = contentWithJob(largest);
    for (const seed of seeds) {
      const { result } = replay(snapshot(largest.id, party("lumberjack", "fighter")), seed, [], content);
      expect(result.outcome, seed).toBe("complete");
      expect(result.dead, seed).toEqual([]);
    }
  });

  // Every unit type Millbrook recruits, read from the content (typescript.md, rule 25).
  for (const { unitType } of must(location(STARTING_LOCATION), "Millbrook").recruits) {
    it(`is completed by a lone ${unitType} on every one of ${SEEDS} seeds that roll no wolf or one, and costs it its life on some that roll two`, () => {
      const runs = played(LUMBER, party(unitType));
      for (const { seed, result } of runs) {
        if (rolled(seed).wolves < WOLVES.max) {
          expect(result.outcome, seed).toBe("complete");
          expect(result.dead, seed).toEqual([]);
        }
      }
      expect(runs.filter((r) => r.result.outcome === "defeat").length).toBeGreaterThan(0);
    });
  }

  for (const unitType of ["villager", "lumberjack", "ranger"] as const) {
    it(`defeats a lone ${unitType} on every one of ${SEEDS} seeds that roll two wolves: about one run in four`, () => {
      const runs = played(LUMBER, party(unitType));
      for (const { seed, result } of runs) expect(result.outcome, seed).toBe(rolled(seed).wolves === WOLVES.max ? "defeat" : "complete");
      const defeats = runs.filter((r) => r.result.outcome === "defeat").length;
      expect(defeats).toBeGreaterThan(SEEDS / 4 - 40);
      expect(defeats).toBeLessThan(SEEDS / 4 + 40);
    });
  }

  it(`loses two villagers nobody on the seeds that roll no wolf or one, and one of them or both on some that roll two, on ${SEEDS} seeds`, () => {
    const runs = played(LUMBER, villagers(2));
    for (const { seed, result } of runs) {
      if (rolled(seed).wolves < WOLVES.max) {
        expect(result.outcome, seed).toBe("complete");
        expect(result.dead, seed).toEqual([]);
      }
    }
    expect(runs.filter((r) => r.result.dead.length > 0).length).toBeGreaterThan(0);
    expect(runs.filter((r) => r.result.outcome === "complete").length).toBeGreaterThan(SEEDS * 0.95);
  });

  it(`leaves a ranger whose lumberjack fell with less timber than the trees would have dropped: the carrier is worth protecting, on ${SEEDS} seeds`, () => {
    const runs = played(LUMBER, party("lumberjack", "ranger"));
    const lost = runs.filter((r) => r.result.outcome === "complete" && r.result.dead.includes("lumberjack-1"));
    expect(lost.length).toBeGreaterThan(0);
    for (const { seed, result } of lost) expect(timberOf(result), seed).toBeLessThan(haul("tree", 2, rolled(seed).trees).min);
  });

  it("ends well inside its time limit for every party above that completes it", () => {
    for (const heroes of [villagers(1), villagers(2), villagers(4), party("lumberjack"), party("lumberjack", "fighter"), party("lumberjack", "fighter", "ranger")]) {
      for (const seed of seeds.slice(0, 100)) {
        const { timeline } = replay(snapshot(LUMBER, heroes), seed, []);
        const end = timeline.events.at(-1)?.timestamp ?? Infinity;
        expect(end, seed).toBeLessThan(stage.timeLimitMs / 2);
      }
    }
  });
});
