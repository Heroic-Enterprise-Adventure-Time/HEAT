import { describe, expect, it } from "vitest";

import {
  ADVENTURE_CONTENT,
  ADVENTURE_TIMELINE_SCHEMA_VERSION,
  AdventureEngine,
  type AdventureLogEntry,
  type Job,
  JOBS,
  levelForXp,
  replay,
} from "../../src/index.js";
import { contentWithJob, hero, ofKind, rewardOf, snapshot, TIMBER, WOLVES } from "./helpers.js";

const retreatAt = (acceptedAtSimTime: number): AdventureLogEntry => ({ kind: "party", acceptedAtSimTime, order: "retreat" });
const pressOnAt = (acceptedAtSimTime: number): AdventureLogEntry => ({ kind: "party", acceptedAtSimTime, order: "press-on" });

const pair = [hero("fighter-1", "fighter"), hero("villager-1", "villager")];
const villagers = [hero("villager-1", "villager"), hero("villager-2", "villager")];

describe("A job run to the end", () => {
  it("runs the wolves job's stages in order on one clock and pays the job's reward and XP", () => {
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
    expect(result.xp).toEqual([
      { heroId: "fighter-1", xp: JOBS[WOLVES].xp },
      { heroId: "villager-1", xp: JOBS[WOLVES].xp },
    ]);
    expect(result.dead).toEqual([]);
    expect(levelForXp(JOBS[WOLVES].xp)).toBe(2);

    const times = timeline.events.map((e) => e.timestamp);
    expect(times).toEqual([...times].sort((x, y) => x - y));
    expect(ofKind(timeline.events, "battle-start")[0]?.timestamp).toBe(4000);
    expect(timeline.events.at(-1)).toEqual({ kind: "adventure-end", timestamp: result.endedAtMs, outcome: "complete" });
  });

  it("gathers until every node is down, carries the cargo through the fight and pays it with the job's pay", () => {
    const { timeline, result } = replay(snapshot(TIMBER, villagers), "a", []);
    expect(result.outcome).toBe("complete");
    expect(result.stages.map((s) => s.ended)).toEqual(["done", "win", "win", "done"]);
    // Two villagers, two trees: two thirds of each tree's 45.
    expect(result.rewards).toEqual([{ material: "timber", amount: 60 }, ...JOBS[TIMBER].pay]);
    expect(result.xp.every((x) => x.xp === JOBS[TIMBER].xp)).toBe(true);

    // The gather ends on the last tree, not on a load.
    const trees = ofKind(timeline.events, "unit-down").filter((e) => e.unitId.includes("tree"));
    expect(trees).toHaveLength(2);
    expect(trees.at(-1)?.timestamp).toBe(result.stages[1]?.endedAtMs);
    // The cargo is carried into the fight.
    expect(ofKind(timeline.events, "stage-end").map((e) => e.cargo)).toEqual([
      [],
      [{ material: "timber", amount: 60 }],
      [{ material: "timber", amount: 60 }],
      [{ material: "timber", amount: 60 }],
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
    expect(result.rewards).toEqual([{ material: "timber", amount: 30 }, ...job.pay]);
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
    expect(result.xp.map((x) => x.heroId)).toEqual(["villager-1", "villager-2"]);
    const lastFight = ofKind(timeline.events, "battle-start")[1];
    expect(lastFight?.participants.map((p) => p.unitId)).not.toContain("fighter-1");
  });
});

describe("Retreat", () => {
  it("is attempted every so often in a fight with a rising chance, and forfeits the wolves job's pay", () => {
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
    expect(result.xp.every((x) => x.xp === JOBS[WOLVES].xp / 2)).toBe(true);
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

  it("from the lumber run keeps what was gathered and forfeits the pay", () => {
    const gatherEnd = replay(snapshot(TIMBER, villagers), "a", []).result.stages[1]?.endedAtMs ?? 0;
    const { result } = replay(snapshot(TIMBER, villagers), "a", [retreatAt(gatherEnd + 1)]);
    expect(result.outcome).toBe("retreat");
    expect(result.stages.at(-1)?.kind).toBe("fight");
    expect(result.rewards).toEqual([{ material: "timber", amount: 60 }]);
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

describe("A stage's time limit", () => {
  it("ends the adventure as a retreat with the job's penalty", () => {
    const timber = JOBS[TIMBER];
    const job: Job = {
      ...timber,
      id: "short-woods",
      stages: timber.stages.map((s) => (s.kind === "gather" ? { ...s, timeLimitMs: 3000 } : s)),
    };
    const { timeline, result } = replay(snapshot(job.id, villagers), "a", [], contentWithJob(job));
    expect(result.outcome).toBe("retreat");
    expect(result.stages.at(-1)).toMatchObject({ kind: "gather", ended: "timeout", endedAtMs: 4000 + 3000 });
    const timber_ = rewardOf(result, "timber");
    expect(timber_).toBeGreaterThan(0);
    expect(timber_).toBeLessThan(60);
    expect(result.rewards.some((r) => r.material === "cloth")).toBe(false);
    expect(result.xp.every((x) => x.xp === Math.floor((timber.xp * timber.retreat.xpPercent) / 100))).toBe(true);
    expect(ofKind(timeline.events, "battle-end")[0]?.result).toBe("timeout");
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
