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
  MONSTERS,
  must,
  replay,
  RESOURCE_NODES,
  type SnapshotHero,
  STARTING_LOCATION,
  warehouseCapacity,
} from "../../src/index.js";
import { atLargest, contentWithJob, haul, hideOf, LUMBER, party, played, RECRUITED_TYPES, rewardOf, SEEDS, seeds, snapshot, STAND, TIMBER, villagers } from "./helpers.js";

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

/**
 * Every party this file plays, each test taking its party from here, so that
 * the test of the time limit covers them all (typescript.md, rule 26): a lone
 * hero of every type Millbrook recruits, read from the content, and the
 * parties named below.
 */
const LONE = RECRUITED_TYPES.map((unitType) => ({ unitType, heroes: party(unitType) }));
const PARTIES = {
  twoVillagers: villagers(2),
  threeVillagers: villagers(3),
  fourVillagers: villagers(4),
  fighterAndVillager: party("fighter", "villager"),
  lumberjackAndFighter: party("lumberjack", "fighter"),
  lumberjackFighterAndRanger: party("lumberjack", "fighter", "ranger"),
  lumberjackAndRanger: party("lumberjack", "ranger"),
};
const EVERY_PARTY: readonly (readonly SnapshotHero[])[] = [...LONE.map((lone) => lone.heroes), ...Object.values(PARTIES)];
/** The lone heroes two wolves always defeat: every type Millbrook recruits but the fighter, which falls to them on about half. */
const ALWAYS_FALL = LONE.filter((lone) => lone.unitType !== "fighter");

/** What one adventure of the job meets: its trees and its wolves, as its seed rolls them. */
function rolled(seed: string): { readonly trees: number; readonly wolves: number } {
  const opponents = expandStages(lumber, seed).flatMap((s) => (s.kind === "gather" ? s.opponents : []));
  const count = (type: string) => opponents.find((o) => o.type === type)?.count ?? 0;
  return { trees: count("tree"), wolves: count("wolf") };
}
/** How many of the seeds roll two wolves: about one in four. */
const TWO_WOLVES = seeds.filter((seed) => rolled(seed).wolves === WOLVES.max).length;

const timberOf = (result: AdventureResult) => rewardOf(result, "timber");

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
  it("is posted by Millbrook's lumber camp, its first job, and not by the job board", () => {
    expect(lumber.facility).toBe("lumber-camp");
    expect(FACILITIES["lumber-camp"].levels.length).toBeGreaterThan(0);
    expect(jobsPostedBy(STARTING_LOCATION, "lumber-camp").map((j) => j.id)).toEqual([LUMBER, STAND]);
    expect(jobsPostedBy(STARTING_LOCATION, "job-board").map((j) => j.id)).not.toContain(LUMBER);
  });

  it("is three trees or four, and half the time a wolf or two among them, with no pay", () => {
    expect(lumber.stages.map((s) => s.kind)).toEqual(["travel", "gather", "arrive"]);
    expect(stage.opponents).toEqual([{ type: "tree", count: { min: 3, max: 4 } }, { type: "wolf", count: { min: 1, max: 2 }, chancePercent: 50 }]);
    expect(lumber.pay).toEqual([]);
  });

  it(`rolls each of its six adventures on some of ${SEEDS} seeds: wolves on about half, two of them on about one in four, and three trees about as often as four`, () => {
    const rolls = seeds.map(rolled);
    const kinds = countBy(rolls, (r) => `${r.trees} trees, ${r.wolves} wolves`);
    expect(Object.keys(kinds).sort()).toEqual(
      [TREES.min, TREES.max].flatMap((t) => [0, WOLVES.min, WOLVES.max].map((w) => `${t} trees, ${w} wolves`)).sort(),
    );
    const withWolves = rolls.filter((r) => r.wolves > 0).length;
    expect(withWolves).toBeGreaterThan(SEEDS / 2 - 50);
    expect(withWolves).toBeLessThan(SEEDS / 2 + 50);
    expect(TWO_WOLVES).toBeGreaterThan(SEEDS / 4 - 40);
    expect(TWO_WOLVES).toBeLessThan(SEEDS / 4 + 40);
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

  it("passes a level-1 warehouse and fits a level-2 one with its timber at a lumberjack's best roll, which the owner accepted for timber alone (decision 0058)", () => {
    const most = haul("tree", 2, TREES.max).max;
    expect(JOB_WAREHOUSE_LEVEL[LUMBER]).toEqual({ material: "timber", level: 2 });
    expect(most).toBeGreaterThan(warehouseCapacity(1));
    expect(most).toBeLessThanOrEqual(warehouseCapacity(2));
  });

  for (const heroes of [PARTIES.threeVillagers, PARTIES.fourVillagers]) {
    it(`is completed by ${heroes.length} villagers on every one of ${SEEDS} seeds with no death, for 90 to 144 timber by its trees and every enemy's XP`, () => {
      expectSafe(heroes, 1);
    });
  }

  it(`is completed by a fighter with a villager on every one of ${SEEDS} seeds with no death, for the timber villagers bring`, () => {
    expectSafe(PARTIES.fighterAndVillager, 1);
  });

  it(`is completed by a lumberjack with a fighter on every one of ${SEEDS} seeds with no death, for 126 to 200 timber by its trees, and no hide`, () => {
    expectSafe(PARTIES.lumberjackAndFighter, 2);
    for (const { seed, result } of played(LUMBER, PARTIES.lumberjackAndFighter)) expect(hideOf(result), seed).toBe(0);
  });

  it(`is completed by a lumberjack, a fighter and a ranger on every one of ${SEEDS} seeds with no death, for the same timber and a hide from some of its wolves: the party that covers every drop`, () => {
    expectSafe(PARTIES.lumberjackFighterAndRanger, 2);
    const without = played(LUMBER, PARTIES.lumberjackAndFighter);
    let hides = 0;
    let wolvesMet = 0;
    played(LUMBER, PARTIES.lumberjackFighterAndRanger).forEach(({ seed, result }, i) => {
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
      const { result } = replay(snapshot(largest.id, PARTIES.lumberjackAndFighter), seed, [], content);
      expect(result.outcome, seed).toBe("complete");
      expect(result.dead, seed).toEqual([]);
    }
  });

  for (const { unitType, heroes } of LONE) {
    it(`is completed by a lone ${unitType} on every one of ${SEEDS} seeds that roll no wolf or one, and costs it its life on some that roll two`, () => {
      const runs = played(LUMBER, heroes);
      for (const { seed, result } of runs) {
        if (rolled(seed).wolves < WOLVES.max) {
          expect(result.outcome, seed).toBe("complete");
          expect(result.dead, seed).toEqual([]);
        }
      }
      expect(runs.filter((r) => r.result.outcome === "defeat").length).toBeGreaterThan(0);
    });
  }

  for (const { unitType, heroes } of ALWAYS_FALL) {
    it(`defeats a lone ${unitType} on every one of ${SEEDS} seeds that roll two wolves`, () => {
      for (const { seed, result } of played(LUMBER, heroes)) expect(result.outcome, seed).toBe(rolled(seed).wolves === WOLVES.max ? "defeat" : "complete");
    });
  }

  it(`defeats a lone fighter on about half of the seeds that roll two wolves, and on no other, of ${SEEDS} seeds`, () => {
    const runs = played(LUMBER, must(LONE.find((lone) => lone.unitType === "fighter"), "the lone fighter").heroes);
    for (const { seed, result } of runs) if (result.outcome === "defeat") expect(rolled(seed).wolves, seed).toBe(WOLVES.max);
    const defeats = runs.filter((r) => r.result.outcome === "defeat").length;
    expect(defeats).toBeGreaterThan(TWO_WOLVES / 4);
    expect(defeats).toBeLessThan((TWO_WOLVES * 3) / 4);
  });

  it(`loses two villagers nobody on the seeds that roll no wolf or one, and one of them or both on some that roll two, on ${SEEDS} seeds`, () => {
    const runs = played(LUMBER, PARTIES.twoVillagers);
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
    const runs = played(LUMBER, PARTIES.lumberjackAndRanger);
    const lost = runs.filter((r) => r.result.outcome === "complete" && r.result.dead.includes("lumberjack-1"));
    expect(lost.length).toBeGreaterThan(0);
    for (const { seed, result } of lost) expect(timberOf(result), seed).toBeLessThan(haul("tree", 2, rolled(seed).trees).min);
  });

  it("ends well inside its time limit for every party this file plays, however the run ends", () => {
    for (const heroes of EVERY_PARTY) {
      for (const seed of seeds.slice(0, 100)) {
        const { result, timeline } = replay(snapshot(LUMBER, heroes), seed, []);
        expect(result.stages.map((s) => s.ended), seed).not.toContain("timeout");
        const end = timeline.events.at(-1)?.timestamp ?? Infinity;
        expect(end, seed).toBeLessThan(stage.timeLimitMs / 2);
      }
    }
  });
});
