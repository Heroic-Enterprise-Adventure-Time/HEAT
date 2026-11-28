import { describe, expect, it } from "vitest";

import { AdventureEngine, type AdventureResult, JOBS, jobsPostedBy, MONSTERS, must, replay, STARTING_LOCATION, UNIT_PROFILES, type UnitType } from "../../src/index.js";
import { atLargest, battleStage, contentWithJob, haul, hero, meets, MILLBROOK_RECRUITS, RECRUITED_TYPES, rewardOf, SEEDS, seeds, snapshot, STICKS, TIMBER, WOLVES } from "./helpers.js";

// The first progression (decision 0031, with the hauls of decision 0058): a
// new player's free villager cannot fail "Pick up sticks", and one run pays
// for the next villager at its worst roll. Since Issue-341 the job varies: a
// wolf is beside the tree one time in ten, so everything here is checked on
// the job as its seeds roll it and again with the wolf on every seed.

const lone = [hero("villager-1", "villager")];
const sticks = JOBS[STICKS];
const gather = battleStage(sticks, "gather");
/** The gather's time limit, which the job is to stay well inside. */
const LIMIT_MS = gather.timeLimitMs;
/** The job with its wolf on every seed: its largest roll, the hardest it can be. */
const withWolf = atLargest(sticks);
const wolfContent = contentWithJob(withWolf);
/** What a villager brings home from the one tree: its drop at woodcutting 1. */
const VILLAGER_TREE = haul("tree", 1);
/** What the next villager costs. */
const VILLAGER_COST = 20;
/** What the job gives a survivor without its wolf, and with it (decision 0058). */
const XP = 5;
const XP_WITH_WOLF = XP + MONSTERS.wolf.xp;
/** Everything a villager can be forced to do: its unit type's own list, read from the content (typescript.md, rule 25). */
const FORCED = must(UNIT_PROFILES.villager, "the villager").actions;

/** The job with one hero forced to the same ability at every step: the worst a player can do with forced actions. */
function forcedEveryTurn(jobId: string, unitType: UnitType, abilityId: string, seed: string, content = wolfContent): AdventureResult {
  const engine = new AdventureEngine(snapshot(jobId, [hero("h", unitType)]), seed, content);
  while (!engine.isComplete()) {
    engine.submitOverride("h", { kind: "force-action", abilityId });
    engine.step();
  }
  return engine.getResult();
}

function expectInsideTheLimit(result: AdventureResult, seed: string): void {
  const stage = result.stages[1];
  expect(stage?.ended, seed).toBe("win");
  expect((stage?.endedAtMs ?? Infinity) - (stage?.startedAtMs ?? 0), seed).toBeLessThan(LIMIT_MS / 1.5);
}

describe("Pick up sticks", () => {
  it("is first on Millbrook's board, before the timber and the wolves jobs", () => {
    const board = jobsPostedBy(STARTING_LOCATION, "job-board").map((j) => j.id);
    expect(board).toEqual([STICKS, TIMBER, WOLVES]);
  });

  it("has one tree to fell, and a wolf beside it one time in ten", () => {
    expect(sticks.stages.map((s) => s.kind)).toEqual(["travel", "gather", "arrive"]);
    expect(gather.opponents).toEqual([{ type: "tree", count: 1 }, { type: "wolf", count: 1, chancePercent: 10 }]);
  });

  it(`is completed by a lone villager on every one of ${SEEDS} seeds, felling the tree for 30 to 36 timber: 5 XP and no damage with no wolf, 10 XP and the wolf beaten with one`, () => {
    expect(VILLAGER_TREE).toEqual({ min: 30, max: 36 });
    expect([XP, XP_WITH_WOLF]).toEqual([5, 10]);
    let wolves = 0;
    for (const seed of seeds) {
      const { result } = replay(snapshot(STICKS, lone), seed, []);
      const wolf = meets(sticks, seed, "wolf");
      if (wolf) wolves++;
      expect(result.outcome, seed).toBe("complete");
      expect(result.dead, seed).toEqual([]);
      expect(result.rewards.map((r) => r.material), seed).toEqual(["timber"]);
      expect(rewardOf(result, "timber"), seed).toBeGreaterThanOrEqual(VILLAGER_TREE.min);
      expect(rewardOf(result, "timber"), seed).toBeLessThanOrEqual(VILLAGER_TREE.max);
      expect(result.xp, seed).toEqual([{ heroId: "villager-1", xp: wolf ? XP_WITH_WOLF : XP }]);
      const health = result.health[0]?.health ?? 0;
      if (wolf) expect(health, seed).toBeLessThan(lone[0]?.stats.maxHealth ?? 0);
      else expect(health, seed).toBe(lone[0]?.stats.maxHealth);
      expectInsideTheLimit(result, seed);
    }
    // About one seed in ten.
    expect(wolves).toBeGreaterThanOrEqual(35);
    expect(wolves).toBeLessThanOrEqual(65);
  });

  it(`is completed by a lone villager with its wolf on every one of ${SEEDS} seeds: the wolf is struck first and beaten, and the tree felled, inside the time limit`, () => {
    for (const seed of seeds) {
      const { result, timeline } = replay(snapshot(withWolf.id, lone), seed, [], wolfContent);
      expect(result.outcome, seed).toBe("complete");
      expect(result.dead, seed).toEqual([]);
      expect(result.health[0]?.health, seed).toBeGreaterThan(0);
      expect(result.xp, seed).toEqual([{ heroId: "villager-1", xp: XP_WITH_WOLF }]);
      expect(rewardOf(result, "timber"), seed).toBeGreaterThanOrEqual(VILLAGER_TREE.min);
      // The wolf is down before the tree is touched.
      const downs = timeline.events.flatMap((e) => (e.kind === "unit-down" ? [e.unitId] : []));
      expect(downs, seed).toEqual(["s1-wolf-1", "s1-tree-1"]);
      expectInsideTheLimit(result, seed);
    }
  });

  for (const abilityId of FORCED) {
    it(`cannot be failed by forcing the villager to ${abilityId} every turn: with its wolf on every one of ${SEEDS} seeds it is the same run, for the same timber`, () => {
      for (const seed of seeds) {
        const result = forcedEveryTurn(withWolf.id, "villager", abilityId, seed);
        // A chop or a mine with the wolf in reach has no target and is dropped (Issue-341), and the tree's roll is its own (decision 0058).
        expect(result, seed).toEqual(replay(snapshot(withWolf.id, [hero("h", "villager")]), seed, [], wolfContent).result);
        expect(result.outcome, seed).toBe("complete");
      }
    });
  }

  it("pays for the next villager in one run, at its worst roll", () => {
    const villager = MILLBROOK_RECRUITS.find((r) => r.unitType === "villager");
    expect(villager?.cost).toEqual([{ material: "timber", amount: VILLAGER_COST }]);
    expect(VILLAGER_TREE.min).toBeGreaterThanOrEqual(VILLAGER_COST);
  });

  it(`brings a hero who cannot cut wood nothing but the XP: a lone fighter or miner completes it with no timber, on ${SEEDS} seeds`, () => {
    for (const unitType of ["fighter", "miner"] as const) {
      for (const seed of seeds) {
        const { result } = replay(snapshot(STICKS, [hero("h", unitType)]), seed, []);
        expect(result.outcome, `${unitType} ${seed}`).toBe("complete");
        expect(result.rewards, `${unitType} ${seed}`).toEqual([]);
        expect(result.xp, `${unitType} ${seed}`).toEqual([{ heroId: "h", xp: meets(sticks, seed, "wolf") ? XP_WITH_WOLF : XP }]);
      }
    }
  });

  it(`is completed with its wolf by a lone hero of every type Millbrook recruits, on every one of ${SEEDS} seeds: a specialist strikes the wolf before it works the tree`, () => {
    expect(RECRUITED_TYPES).toEqual(expect.arrayContaining(["villager", "lumberjack", "miner"]));
    for (const unitType of RECRUITED_TYPES) {
      for (const seed of seeds) {
        const { result } = replay(snapshot(withWolf.id, [hero("h", unitType)]), seed, [], wolfContent);
        expect(result.outcome, `${unitType} ${seed}`).toBe("complete");
        expect(result.dead, `${unitType} ${seed}`).toEqual([]);
      }
    }
  });

  it(`gives a lone ranger a hide from its wolf on about half of ${SEEDS} seeds, and a lone villager none`, () => {
    let hides = 0;
    for (const seed of seeds) {
      const ranger = replay(snapshot(withWolf.id, [hero("h", "ranger")]), seed, [], wolfContent).result;
      expect(rewardOf(ranger, "hide"), seed).toBeLessThanOrEqual(1);
      hides += rewardOf(ranger, "hide");
      expect(rewardOf(replay(snapshot(withWolf.id, lone), seed, [], wolfContent).result, "hide"), seed).toBe(0);
    }
    expect(hides).toBeGreaterThan(SEEDS / 2 - 50);
    expect(hides).toBeLessThan(SEEDS / 2 + 50);
  });
});
