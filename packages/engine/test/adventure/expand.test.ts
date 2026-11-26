import { countBy, range } from "es-toolkit";
import { describe, expect, it } from "vitest";

import {
  AdventureEngine,
  alwaysAppears,
  countRange,
  type ExpandedStage,
  expandStages,
  type Job,
  JOBS,
  largestStages,
  leastStages,
  must,
  replay,
  type StageEntry,
} from "../../src/index.js";
import { CARAVAN, contentWithJob, hero, LUMBER, meets, ofKind, SEEDS, seeds, snapshot, STICKS, TIMBER } from "./helpers.js";

// A job's adventures vary (decision 0058, Issue-341): each entry of a fight or
// a gather stage has a count or a range for it and perhaps a chance of
// appearing, and the engine expands the job's stages from the adventure's
// seed before the first one runs.

const sticks = JOBS[STICKS];

/** A job of one gather stage with these entries, for what the game's own jobs do not use yet. */
function gatherOf(id: string, opponents: readonly StageEntry[]): Job {
  return { ...JOBS[TIMBER], id, stages: [{ kind: "gather", opponents, timeLimitMs: 300_000 }, { kind: "arrive" }] };
}

/** The entries of an expansion's fight and gather stages, stage by stage. */
function opponentsOf(stages: readonly ExpandedStage[]): { type: string; count: number }[][] {
  return stages.flatMap((stage) => (stage.kind === "fight" || stage.kind === "gather" ? [stage.opponents.map((o) => ({ type: o.type, count: o.count }))] : []));
}

describe("A job's stages, expanded from the seed", () => {
  it("are the same for a seed, however often they are asked for", () => {
    for (const seed of seeds) expect(expandStages(sticks, seed), seed).toEqual(expandStages(sticks, seed));
  });

  it(`differ across seeds: "Pick up sticks" is its tree alone on most of ${SEEDS} seeds, and its tree with a wolf on about one in ten`, () => {
    const rolls = countBy(seeds, (seed) => JSON.stringify(opponentsOf(expandStages(sticks, seed))));
    const alone = JSON.stringify([[{ type: "tree", count: 1 }]]);
    const withWolf = JSON.stringify([[{ type: "tree", count: 1 }, { type: "wolf", count: 1 }]]);
    expect(Object.keys(rolls).sort()).toEqual([alone, withWolf].sort());
    // One in ten of 500 is 50; a share far from it would be a roll read wrongly.
    expect(rolls[withWolf]).toBeGreaterThanOrEqual(35);
    expect(rolls[withWolf]).toBeLessThanOrEqual(65);
  });

  it("keep the job's stages in number and kind, and a travel and an arrival as they are written", () => {
    for (const job of Object.values(JOBS)) {
      for (const seed of seeds.slice(0, 50)) {
        const stages = expandStages(job, seed);
        expect(stages.map((s) => s.kind), `${job.id} ${seed}`).toEqual(job.stages.map((s) => s.kind));
        stages.forEach((stage, i) => {
          const written = job.stages[i];
          if (stage.kind === "travel" || stage.kind === "arrive") expect(stage, `${job.id} ${seed}`).toEqual(written);
          else expect(stage.timeLimitMs, `${job.id} ${seed}`).toBe(written && "timeLimitMs" in written ? written.timeLimitMs : undefined);
        });
      }
    }
  });

  it("leave a job with no variance exactly as it is written, on every seed", () => {
    const fixed = Object.values(JOBS).filter((job) => job.stages.every((s) => !("opponents" in s) || s.opponents.every((o) => alwaysAppears(o) && typeof o.count === "number")));
    // Every job but the first, the lumber camp's and the caravan, today.
    expect(fixed.map((job) => job.id)).toEqual(Object.keys(JOBS).filter((id) => id !== STICKS && id !== LUMBER && id !== CARAVAN));
    for (const job of fixed) {
      for (const seed of seeds.slice(0, 50)) expect(expandStages(job, seed), `${job.id} ${seed}`).toEqual(job.stages);
    }
  });

  it("roll a count within its range, every number of it on some seed", () => {
    const job = gatherOf("one-to-three-trees", [{ type: "tree", count: { min: 1, max: 3 } }]);
    const counts = countBy(seeds, (seed) => String(opponentsOf(expandStages(job, seed))[0]?.[0]?.count));
    expect(Object.keys(counts).sort()).toEqual(["1", "2", "3"]);
    // Uniform: each of the three on about a third of the seeds.
    for (const n of Object.values(counts)) expect(n).toBeGreaterThan(SEEDS / 3 - 40);
  });

  it("roll an entry with a chance and a range both: absent, or present within its range", () => {
    const job = gatherOf("a-tree-and-maybe-wolves", [{ type: "tree", count: 1 }, { type: "wolf", count: { min: 2, max: 3 }, chancePercent: 50 }]);
    const wolves = countBy(seeds, (seed) => String(opponentsOf(expandStages(job, seed))[0]?.find((o) => o.type === "wolf")?.count ?? 0));
    expect(Object.keys(wolves).sort()).toEqual(["0", "2", "3"]);
    expect(wolves["0"]).toBeGreaterThan(SEEDS / 2 - 50);
    expect(wolves["0"]).toBeLessThan(SEEDS / 2 + 50);
  });

  it("give every entry its own two draws, so a chance given to one entry does not move the roll of the next", () => {
    const veins: StageEntry = { type: "ore-vein", count: { min: 1, max: 4 } };
    const plain = gatherOf("trees-then-veins", [{ type: "tree", count: 1 }, veins]);
    const varied = gatherOf("maybe-trees-then-veins", [{ type: "tree", count: { min: 1, max: 5 }, chancePercent: 30 }, veins]);
    const veinsOf = (job: Job, seed: string) => opponentsOf(expandStages(job, seed))[0]?.find((o) => o.type === "ore-vein")?.count;
    for (const seed of seeds) expect(veinsOf(varied, seed), seed).toBe(veinsOf(plain, seed));
  });

  it("do not depend on the party or on anything forced: the roll is the seed's and the job's alone", () => {
    const wolfSeed = must(seeds.find((seed) => meets(sticks, seed, "wolf")), "a seed that rolls the wolf");
    const lone = replay(snapshot(STICKS, [hero("villager-1", "villager")]), wolfSeed, []).timeline;
    const three = replay(snapshot(STICKS, [hero("fighter-1", "fighter"), hero("ranger-1", "ranger"), hero("villager-1", "villager")]), wolfSeed, []).timeline;
    const forced = new AdventureEngine(snapshot(STICKS, [hero("villager-1", "villager")]), wolfSeed);
    while (!forced.isComplete()) {
      forced.submitOverride("villager-1", { kind: "force-action", abilityId: "move-up" });
      forced.step();
    }
    const against = (events: Parameters<typeof ofKind>[0]) => ofKind(events, "battle-start")[0]?.participants.filter((p) => p.side === "opponents").map((p) => p.unitId);
    expect(against(lone.events)).toEqual(["s1-tree-1", "s1-wolf-1"]);
    expect(against(three.events)).toEqual(against(lone.events));
    expect(against(forced.getTimeline().events)).toEqual(against(lone.events));
  });

  it("refuse a stage that rolled nothing to meet, naming the job", () => {
    const job = gatherOf("nothing-certain", [{ type: "tree", count: 1, chancePercent: 1 }]);
    const rollsNothing = (seed: string): boolean => {
      try {
        expandStages(job, seed);
        return false;
      } catch {
        return true;
      }
    };
    const empty = must(seeds.find(rollsNothing), "a seed on which the one entry does not appear");
    expect(() => expandStages(job, empty)).toThrow(/Stage 0 of job nothing-certain rolled nothing to meet/);
  });
});

describe("What the adventure engine runs", () => {
  it(`is the expansion, stage for stage: every battle of "Pick up sticks" sets against the party who the expansion names, on ${SEEDS} seeds`, () => {
    const fighter = [hero("fighter-1", "fighter")];
    for (const seed of seeds) {
      const { timeline, result } = replay(snapshot(STICKS, fighter), seed, []);
      expect(result.outcome, seed).toBe("complete");
      const expected = opponentsOf(expandStages(sticks, seed)).map((stage) => stage.flatMap((o) => range(o.count).map(() => o.type)));
      const met = ofKind(timeline.events, "battle-start").map((b) => b.participants.filter((p) => p.side === "opponents").map((p) => p.type));
      expect(met, seed).toEqual(expected);
    }
  });

  it("runs a rolled count, each unit with its own id", () => {
    const job = gatherOf("two-to-three-trees", [{ type: "tree", count: { min: 2, max: 3 } }, { type: "wolf", count: 1, chancePercent: 50 }]);
    const content = contentWithJob(job);
    const heroes = [hero("fighter-1", "fighter"), hero("villager-1", "villager"), hero("villager-2", "villager")];
    const seen = new Set<string>();
    for (const seed of seeds.slice(0, 40)) {
      const { timeline } = replay(snapshot(job.id, heroes), seed, [], content);
      const ids = (ofKind(timeline.events, "battle-start")[0]?.participants ?? []).filter((p) => p.side === "opponents").map((p) => p.unitId);
      const [stage] = opponentsOf(expandStages(job, seed));
      const trees = stage?.find((o) => o.type === "tree")?.count ?? 0;
      const wolves = stage?.find((o) => o.type === "wolf")?.count ?? 0;
      expect(ids, seed).toEqual([...range(trees).map((i) => `s0-tree-${i + 1}`), ...range(wolves).map((i) => `s0-wolf-${i + 1}`)]);
      seen.add(`${trees}/${wolves}`);
    }
    expect([...seen].sort()).toEqual(["2/0", "2/1", "3/0", "3/1"]);
  });
});

describe("A job's largest and least rolls", () => {
  it("are every entry at its most, and only the entries that always appear at their least", () => {
    const job = gatherOf("the-lot", [{ type: "tree", count: { min: 2, max: 4 } }, { type: "wolf", count: { min: 1, max: 2 }, chancePercent: 25 }, { type: "ore-vein", count: 1 }]);
    expect(opponentsOf(largestStages(job))).toEqual([[{ type: "tree", count: 4 }, { type: "wolf", count: 2 }, { type: "ore-vein", count: 1 }]]);
    expect(opponentsOf(leastStages(job))).toEqual([[{ type: "tree", count: 2 }, { type: "ore-vein", count: 1 }]]);
    expect(countRange(3)).toEqual({ min: 3, max: 3 });
  });

  it('bound "Pick up sticks": a tree alone at its least, a tree and a wolf at its largest', () => {
    expect(opponentsOf(leastStages(sticks))).toEqual([[{ type: "tree", count: 1 }]]);
    expect(opponentsOf(largestStages(sticks))).toEqual([[{ type: "tree", count: 1 }, { type: "wolf", count: 1 }]]);
  });
});
