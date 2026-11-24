import { sumBy } from "es-toolkit";
import { describe, expect, it } from "vitest";

import {
  ADVENTURE_CONTENT,
  ADVENTURE_TIMELINE_SCHEMA_VERSION,
  AdventureEngine,
  type AdventureEvent,
  type AdventureLogEntry,
  type Job,
  JOBS,
  levelForXp,
  MONSTERS,
  replay,
  RESOURCE_NODES,
  UNLOCK_IDS,
} from "../../src/index.js";
import { contentWithJob, enemiesXp, haul, hero, ofKind, rewardOf, snapshot, TIMBER, WOLVES } from "./helpers.js";

const retreatAt = (acceptedAtSimTime: number): AdventureLogEntry => ({ kind: "party", acceptedAtSimTime, order: "retreat" });
const pressOnAt = (acceptedAtSimTime: number): AdventureLogEntry => ({ kind: "party", acceptedAtSimTime, order: "press-on" });

const pair = [hero("fighter-1", "fighter"), hero("villager-1", "villager")];
const villagers = [hero("villager-1", "villager"), hero("villager-2", "villager")];
const strikeAt = (acceptedAtSimTime: number, unitId: string): AdventureLogEntry => ({ kind: "unit", acceptedAtSimTime, unitId, override: { kind: "force-action", abilityId: "strike" } });
/** What each enemy of these tests gives a hero that survives (decision 0058). */
const WOLF_XP = MONSTERS.wolf.xp;
const TREE_XP = RESOURCE_NODES.tree.xp;

describe("A job run to the end", () => {
  it("runs the wolves job's stages in order on one clock and pays the job's reward, and to each hero the wolves' XP and the bonus", () => {
    const { timeline, result } = replay(snapshot(WOLVES, pair), "a", []);
    expect(result.outcome).toBe("complete");
    expect(result.stages.map((s) => [s.kind, s.ended])).toEqual([
      ["travel", "done"],
      ["fight", "win"],
      ["arrive", "done"],
    ]);
    expect(result.stages[0]?.endedAtMs).toBe(4000);
    expect(result.stages[1]?.startedAtMs).toBe(4000);
    expect(result.reachedStage).toBe(2);
    expect(result.rewards).toEqual(JOBS[WOLVES].pay);
    // Each survivor earns both wolves' XP in full, not a share of it, and the bonus for arriving.
    const earned = 2 * WOLF_XP + JOBS[WOLVES].bonusXp;
    expect(earned).toBe(20);
    expect(result.xp).toEqual([
      { heroId: "fighter-1", xp: earned },
      { heroId: "villager-1", xp: earned },
    ]);
    expect(result.dead).toEqual([]);
    expect(levelForXp(earned)).toBe(2);

    const times = timeline.events.map((e) => e.timestamp);
    expect(times).toEqual([...times].sort((x, y) => x - y));
    expect(ofKind(timeline.events, "battle-start")[0]?.timestamp).toBe(4000);
    expect(timeline.events.at(-1)).toEqual({ kind: "adventure-end", timestamp: result.endedAtMs, outcome: "complete" });
  });

  it("gathers until every node is down, carries what dropped through the fight and pays it with the job's pay", () => {
    const { timeline, result } = replay(snapshot(TIMBER, villagers), "a", []);
    expect(result.outcome).toBe("complete");
    expect(result.stages.map((s) => s.ended)).toEqual(["done", "win", "win", "done"]);
    // Two trees, each dropping at woodcutting 1, a villager's level.
    const timber = rewardOf(result, "timber");
    expect(timber).toBeGreaterThanOrEqual(haul("tree", 1, 2).min);
    expect(timber).toBeLessThanOrEqual(haul("tree", 1, 2).max);
    expect(result.rewards).toEqual([{ material: "timber", amount: timber }, ...JOBS[TIMBER].pay]);
    expect(result.xp.map((x) => x.xp)).toEqual([15, 15]);
    expect(enemiesXp(JOBS[TIMBER]) + JOBS[TIMBER].bonusXp).toBe(15);

    // The gather ends on the last tree, not on a load.
    const trees = ofKind(timeline.events, "unit-down").filter((e) => e.unitId.includes("tree"));
    expect(trees).toHaveLength(2);
    expect(trees.at(-1)?.timestamp).toBe(result.stages[1]?.endedAtMs);
    // What dropped is the two trees' drops, and it is carried into the fight.
    const drops = ofKind(timeline.events, "drop");
    expect(drops.map((e) => e.unitId).sort()).toEqual(["s1-tree-1", "s1-tree-2"]);
    expect(sumBy(drops, (e) => e.amount)).toBe(timber);
    expect(ofKind(timeline.events, "stage-end").map((e) => e.drops)).toEqual([
      [],
      [{ material: "timber", amount: timber }],
      [{ material: "timber", amount: timber }],
      [{ material: "timber", amount: timber }],
    ]);
  });

  it("runs a stage of nodes and monsters together, which ends when all of them are down", () => {
    const job: Job = {
      ...JOBS[TIMBER],
      id: "wolf-in-the-woods",
      stages: [{ kind: "gather", opponents: [{ type: "tree", count: 1 }, { type: "wolf", count: 1 }], timeLimitMs: 90_000 }, { kind: "arrive" }],
    };
    const { timeline, result } = replay(snapshot(job.id, villagers), "a", [], contentWithJob(job));
    expect(result.outcome).toBe("complete");
    expect(result.stages.map((s) => [s.kind, s.ended])).toEqual([["gather", "win"], ["arrive", "done"]]);
    expect(ofKind(timeline.events, "battle-start")[0]?.participants.filter((p) => p.side === "opponents").map((p) => p.kind).sort()).toEqual(["monster", "resource"]);
    expect(ofKind(timeline.events, "unit-down").map((e) => e.unitId).sort()).toEqual(["s0-tree-1", "s0-wolf-1"]);
    expect(result.rewards).toEqual([{ material: "timber", amount: rewardOf(result, "timber") }, ...job.pay]);
    expect(rewardOf(result, "timber")).toBeGreaterThanOrEqual(haul("tree", 1).min);
    expect(result.xp.map((x) => x.xp)).toEqual([TREE_XP + WOLF_XP + job.bonusXp, TREE_XP + WOLF_XP + job.bonusXp]);
  });

  it("gives every unit its own id when a stage names a type twice", () => {
    const job: Job = {
      ...JOBS[TIMBER],
      id: "woods-either-side",
      stages: [{ kind: "gather", opponents: [{ type: "tree", count: 1 }, { type: "wolf", count: 1 }, { type: "tree", count: 2 }], timeLimitMs: 90_000 }, { kind: "arrive" }],
    };
    const { timeline } = replay(snapshot(job.id, villagers), "a", [], contentWithJob(job));
    const opponents = ofKind(timeline.events, "battle-start")[0]?.participants.filter((p) => p.side === "opponents");
    expect(opponents?.map((p) => p.unitId)).toEqual(["s0-tree-1", "s0-wolf-1", "s0-tree-2", "s0-tree-3"]);
  });

  it("carries health from one stage to the next", () => {
    const job: Job = {
      ...JOBS[WOLVES],
      id: "two-fights",
      stages: [
        { kind: "fight", opponents: [{ type: "wolf", count: 2 }], timeLimitMs: 60_000 },
        { kind: "fight", opponents: [{ type: "wolf", count: 1 }], timeLimitMs: 60_000 },
        { kind: "arrive" },
      ],
    };
    const { timeline } = replay(snapshot(job.id, pair), "a", [], contentWithJob(job));
    const firstEnd = ofKind(timeline.events, "stage-end")[0];
    const secondStart = ofKind(timeline.events, "battle-start")[1];
    expect(firstEnd?.health.some((h) => h.health < 30)).toBe(true);
    for (const h of firstEnd?.health ?? []) {
      expect(secondStart?.participants.find((p) => p.unitId === h.heroId)?.health).toBe(h.health);
    }
  });

  it("leaves a fallen hero out of later stages, lists it dead and gives XP only to the survivors", () => {
    const party = [hero("fighter-1", "fighter", { maxHealth: 5 }), hero("villager-1", "villager"), hero("villager-2", "villager")];
    const job: Job = { ...JOBS[WOLVES], id: "wolves-then-woods", stages: [...JOBS[WOLVES].stages.slice(0, 2), { kind: "travel", lengthMs: 1000 }, { kind: "gather", opponents: [{ type: "tree", count: 1 }], timeLimitMs: 60_000 }, { kind: "arrive" }] };
    const { timeline, result } = replay(snapshot(job.id, party), "a", [], contentWithJob(job));
    expect(result.outcome).toBe("complete");
    expect(result.dead).toEqual(["fighter-1"]);
    // The survivors earn the XP of every enemy that went down, the wolves the fighter fell to included, and the bonus.
    const earned = 2 * WOLF_XP + TREE_XP + job.bonusXp;
    expect(result.xp).toEqual([{ heroId: "villager-1", xp: earned }, { heroId: "villager-2", xp: earned }]);
    const lastFight = ofKind(timeline.events, "battle-start")[1];
    expect(lastFight?.participants.map((p) => p.unitId)).not.toContain("fighter-1");
  });
});

describe("Retreat", () => {
  it("is attempted every so often in a fight with a rising chance, and loses the wolves job's pay and its bonus", () => {
    const { timeline, result } = replay(snapshot(WOLVES, pair), "a", [retreatAt(5000)]);
    const attempts = ofKind(timeline.events, "retreat-attempt");
    const { intervalMs, firstChancePercent, risePercent } = ADVENTURE_CONTENT.retreat;
    expect(attempts.length).toBeGreaterThan(0);
    attempts.forEach((a, i) => {
      expect(a.chancePercent).toBe(Math.min(100, firstChancePercent + risePercent * i));
      expect(a.succeeded).toBe(i === attempts.length - 1);
      expect(a.succeeded).toBe(a.roll <= a.chancePercent);
    });
    const order = ofKind(timeline.events, "order")[0];
    expect(attempts[0]?.timestamp).toBe((order?.timestamp ?? 0) + intervalMs);

    expect(result.outcome).toBe("retreat");
    expect(result.stages.at(-1)).toMatchObject({ kind: "fight", ended: "retreat", endedAtMs: attempts.at(-1)?.timestamp });
    expect(ofKind(timeline.events, "battle-end").at(-1)).toMatchObject({ result: "retreat", timestamp: result.endedAtMs });
    expect(result.reachedStage).toBe(1);
    expect(result.rewards).toEqual([]);
    // What the party keeps is the XP of the wolves it put down before it got away, and no bonus.
    const wolvesDown = ofKind(timeline.events, "unit-down").filter((e) => e.unitId.includes("wolf")).length;
    expect(wolvesDown).toBeLessThan(2);
    expect(result.xp.map((x) => x.xp)).toEqual(result.xp.map(() => wolvesDown * WOLF_XP));
  });

  it("succeeds for certain once the chance reaches 100", () => {
    const content = { ...ADVENTURE_CONTENT, retreat: { intervalMs: 500, firstChancePercent: 0, risePercent: 50 } };
    const { timeline } = replay(snapshot(WOLVES, pair), "a", [retreatAt(4500)], content);
    const attempts = ofKind(timeline.events, "retreat-attempt");
    expect(attempts.map((a) => a.chancePercent)).toEqual([0, 50, 100].slice(0, attempts.length));
    expect(attempts[0]?.succeeded).toBe(false);
    expect(attempts.at(-1)?.succeeded).toBe(true);
  });

  it("is certain when a stage completes with it selected, with no roll", () => {
    const { timeline, result } = replay(snapshot(WOLVES, pair), "a", [retreatAt(1000)]);
    expect(ofKind(timeline.events, "retreat-attempt")).toEqual([]);
    expect(result.outcome).toBe("retreat");
    expect(result.stages).toEqual([{ stage: 0, kind: "travel", ended: "done", startedAtMs: 0, endedAtMs: 4000 }]);
    expect(result.reachedStage).toBe(0);
  });

  it("from the lumber run keeps the drops and the enemies' XP, and loses the pay and the bonus (decision 0058)", () => {
    const whole = replay(snapshot(TIMBER, villagers), "a", []).result;
    const gatherEnd = whole.stages[1]?.endedAtMs ?? 0;
    const { timeline, result } = replay(snapshot(TIMBER, villagers), "a", [retreatAt(gatherEnd + 1)]);
    expect(result.outcome).toBe("retreat");
    expect(result.stages.at(-1)?.kind).toBe("fight");
    // The trees' drops, the same as the whole run's on this seed, and no cloth.
    expect(result.rewards).toEqual([{ material: "timber", amount: rewardOf(whole, "timber") }]);
    const wolfDown = ofKind(timeline.events, "unit-down").some((e) => e.unitId.includes("wolf"));
    const kept = 2 * TREE_XP + (wolfDown ? WOLF_XP : 0);
    expect(result.xp).toEqual([{ heroId: "villager-1", xp: kept }, { heroId: "villager-2", xp: kept }]);
    expect(kept).toBeLessThan(15);
  });

  it("ordered among the trees is certain when the last of them falls, and the party leaves with their timber and their XP", () => {
    const whole = replay(snapshot(TIMBER, villagers), "a", []).result;
    // Past the last attempt that could fail, so the retreat is the one a completed stage makes certain.
    const order = (whole.stages[1]?.endedAtMs ?? 0) - 100;
    const { result } = replay(snapshot(TIMBER, villagers), "a", [retreatAt(order)]);
    expect(result.outcome).toBe("retreat");
    expect(result.stages.at(-1)).toMatchObject({ kind: "gather", ended: "win" });
    expect(result.rewards).toEqual([{ material: "timber", amount: rewardOf(whole, "timber") }]);
    expect(result.xp.map((x) => x.xp)).toEqual([2 * TREE_XP, 2 * TREE_XP]);
  });

  it("is called off by press on", () => {
    const { timeline, result } = replay(snapshot(WOLVES, pair), "a", [retreatAt(5000), pressOnAt(6000)]);
    expect(ofKind(timeline.events, "retreat-attempt")).toEqual([]);
    expect(result.outcome).toBe("complete");
    expect(timeline.overrideLog.map((e) => e.kind === "party" && e.order)).toEqual(["retreat", "press-on"]);
  });

  it("logs only an order that changes the selection", () => {
    expect(replay(snapshot(WOLVES, pair), "a", [pressOnAt(1000)]).timeline.overrideLog).toEqual([]);
    const { timeline } = replay(snapshot(WOLVES, pair), "a", [retreatAt(5000), retreatAt(5500)]);
    expect(timeline.overrideLog).toHaveLength(1);
    expect(ofKind(timeline.events, "order")).toHaveLength(1);
  });
});

/** Long enough for two villagers to fell one tree of two, and not the other. */
const LIMIT_MS = 12_000;

describe("A stage's time limit", () => {
  it("ends the adventure as a retreat, which keeps what had dropped and the XP of what had fallen, and nothing for the tree still standing", () => {
    const timber = JOBS[TIMBER];
    const job: Job = {
      ...timber,
      id: "short-woods",
      stages: timber.stages.map((s) => (s.kind === "gather" ? { ...s, timeLimitMs: LIMIT_MS } : s)),
    };
    const { timeline, result } = replay(snapshot(job.id, villagers), "a", [], contentWithJob(job));
    expect(result.outcome).toBe("retreat");
    expect(result.stages.at(-1)).toMatchObject({ kind: "gather", ended: "timeout", endedAtMs: 4000 + LIMIT_MS });
    expect(ofKind(timeline.events, "unit-down")).toHaveLength(1);
    const kept = rewardOf(result, "timber");
    expect(kept).toBeGreaterThanOrEqual(haul("tree", 1).min);
    expect(kept).toBeLessThanOrEqual(haul("tree", 1).max);
    expect(result.rewards).toEqual([{ material: "timber", amount: kept }]);
    expect(result.xp.map((x) => x.xp)).toEqual([TREE_XP, TREE_XP]);
    expect(ofKind(timeline.events, "battle-end")[0]?.result).toBe("timeout");
  });

  it("reached before anything falls leaves the party with nothing: no hit gathers", () => {
    const timber = JOBS[TIMBER];
    const job: Job = { ...timber, id: "shorter-woods", stages: timber.stages.map((s) => (s.kind === "gather" ? { ...s, timeLimitMs: 3000 } : s)) };
    const { result } = replay(snapshot(job.id, villagers), "a", [], contentWithJob(job));
    expect(result.outcome).toBe("retreat");
    expect(result.rewards).toEqual([]);
    expect(result.xp.map((x) => x.xp)).toEqual([0, 0]);
  });
});

describe("Defeat", () => {
  it("keeps nothing when the whole party is down", () => {
    const { result } = replay(snapshot(WOLVES, [hero("villager-1", "villager")]), "a", []);
    expect(result.outcome).toBe("defeat");
    expect(result.stages.at(-1)).toMatchObject({ kind: "fight", ended: "loss" });
    expect(result.rewards).toEqual([]);
    expect(result.xp).toEqual([]);
    expect(result.dead).toEqual(["villager-1"]);
  });

  it("keeps nothing of what had dropped either: a villager fells the tree, falls to the wolves, and no timber comes home", () => {
    const job: Job = {
      ...JOBS[WOLVES],
      id: "woods-then-wolves",
      stages: [{ kind: "gather", opponents: [{ type: "tree", count: 1 }], timeLimitMs: 60_000 }, { kind: "fight", opponents: [{ type: "wolf", count: 2 }], timeLimitMs: 60_000 }, { kind: "arrive" }],
    };
    const { timeline, result } = replay(snapshot(job.id, [hero("villager-1", "villager")]), "a", [], contentWithJob(job));
    expect(ofKind(timeline.events, "stage-end")[0]?.drops).toEqual([{ material: "timber", amount: ofKind(timeline.events, "drop")[0]?.amount }]);
    expect(result.outcome).toBe("defeat");
    expect(result.rewards).toEqual([]);
    expect(result.xp).toEqual([]);
  });
});

describe("The unlocks a run earned", () => {
  // No job of the content grants one until Issue-352, so the wolves job is given a grant here.
  const scouting: Job = { ...JOBS[WOLVES], id: "wolves-that-open-a-road", grants: [...UNLOCK_IDS] };
  const content = contentWithJob(scouting);

  it("are its job's grants on arrival", () => {
    const { result } = replay(snapshot(scouting.id, pair), "a", [], content);
    expect(result.outcome).toBe("complete");
    expect(result.unlocks).toEqual(UNLOCK_IDS);
    expect(UNLOCK_IDS.length).toBeGreaterThan(0);
  });

  it("are none on a retreat, ordered in the fight or made certain on the road", () => {
    for (const at of [5000, 1000]) {
      const { result } = replay(snapshot(scouting.id, pair), "a", [retreatAt(at)], content);
      expect(result.outcome, String(at)).toBe("retreat");
      expect(result.unlocks, String(at)).toEqual([]);
    }
  });

  it("are none when a stage's time limit is reached", () => {
    const short: Job = { ...scouting, id: "wolves-with-no-time", stages: scouting.stages.map((s) => (s.kind === "fight" ? { ...s, timeLimitMs: 1000 } : s)) };
    const { result } = replay(snapshot(short.id, pair), "a", [], contentWithJob(short));
    expect(result.stages.at(-1)?.ended).toBe("timeout");
    expect(result.unlocks).toEqual([]);
  });

  it("are none with all down", () => {
    const { result } = replay(snapshot(scouting.id, [hero("villager-1", "villager")]), "a", [], content);
    expect(result.outcome).toBe("defeat");
    expect(result.unlocks).toEqual([]);
  });

  it("are none for a job that grants none, arrived or not", () => {
    expect(replay(snapshot(WOLVES, pair), "a", []).result).toMatchObject({ outcome: "complete", unlocks: [] });
    expect(replay(snapshot(WOLVES, pair), "a", [retreatAt(1000)]).result).toMatchObject({ outcome: "retreat", unlocks: [] });
  });

  it("are a list of the result's own: changing it does not change the job", () => {
    const { result } = replay(snapshot(scouting.id, pair), "a", [], content);
    expect(result.unlocks).not.toBe(scouting.grants);
  });
});

describe("An enemy's roll", () => {
  it("is not moved by an override: forced strikes change the fight's events and leave every drop what it was (decision 0058)", () => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      const plain = replay(snapshot(TIMBER, villagers), seed, []);
      const log = [4100, 5600, 7100, 8600, 10_100, 14_000, 18_000].flatMap((at) => [strikeAt(at, "villager-1"), strikeAt(at + 200, "villager-2")]);
      const forced = replay(snapshot(TIMBER, villagers), seed, log);
      expect(forced.timeline.overrideLog.length, seed).toBeGreaterThan(0);
      expect(forced.timeline.events, seed).not.toEqual(plain.timeline.events);
      const drops = (events: readonly AdventureEvent[]) => ofKind(events, "drop").map((e) => `${e.unitId} ${e.material} ${e.amount}`).sort();
      expect(drops(forced.timeline.events), seed).toEqual(drops(plain.timeline.events));
      expect(forced.result.rewards, seed).toEqual(plain.result.rewards);
    }
  });

  it("differs from seed to seed, and from one tree of a stage to the other", () => {
    const amounts = ["a", "b", "c", "d", "e", "f", "g", "h"].map((seed) => ofKind(replay(snapshot(TIMBER, villagers), seed, []).timeline.events, "drop").map((e) => e.amount));
    expect(new Set(amounts.map((a) => a.join(","))).size).toBeGreaterThan(1);
    expect(amounts.some(([first, second]) => first !== second)).toBe(true);
  });
});

describe("The engine's input", () => {
  it("drops a forced action given outside a battle and refuses one for a hero not in the party", () => {
    const engine = new AdventureEngine(snapshot(WOLVES, pair), "a");
    engine.step();
    engine.submitOverride("villager-1", { kind: "force-action", abilityId: "strike" });
    expect(() => {
      engine.submitOverride("stranger", { kind: "force-action", abilityId: "strike" });
    }).toThrow();
    while (!engine.isComplete()) engine.step();
    expect(engine.getTimeline().overrideLog).toEqual([]);
  });

  it("reports the order in force and the one waiting", () => {
    const engine = new AdventureEngine(snapshot(WOLVES, pair), "a");
    expect(engine.getOrder()).toBe("press-on");
    engine.submitOrder("retreat");
    expect(engine.getOrder()).toBe("retreat");
    engine.step();
    expect(engine.getOrder()).toBe("retreat");
  });

  it("refuses a party of none or more than four, a hero twice and an unknown job", () => {
    const five = ["a", "b", "c", "d", "e"].map((id) => hero(id, "villager"));
    expect(() => new AdventureEngine(snapshot(WOLVES, []), "a")).toThrow();
    expect(() => new AdventureEngine(snapshot(WOLVES, five), "a")).toThrow();
    expect(() => new AdventureEngine(snapshot(WOLVES, [hero("a", "villager"), hero("a", "fighter")]), "a")).toThrow();
    expect(() => new AdventureEngine(snapshot("no-such-job", pair), "a")).toThrow();
    expect(() => new AdventureEngine(snapshot(WOLVES, [hero("w", "wizard")]), "a")).toThrow();
  });

  it("stamps the timeline with the schema version and carries the issuing version, seed and party", () => {
    const snap = snapshot(WOLVES, pair);
    const { timeline } = replay(snap, "a", []);
    expect(timeline).toMatchObject({ schemaVersion: ADVENTURE_TIMELINE_SCHEMA_VERSION, version: "test-version", seed: "a", jobId: WOLVES, party: pair });
  });
});
