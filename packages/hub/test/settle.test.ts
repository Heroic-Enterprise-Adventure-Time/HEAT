import { randomUUID } from "node:crypto";

import { type DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { range } from "es-toolkit";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  type AdventureSnapshot,
  type AdventureTimeline,
  expandStages,
  JOBS,
  LEVEL_XP,
  levelForXp,
  MONSTERS,
  must,
  replay,
  RESOURCE_NODES,
  UNIT_PROFILES,
  type UnitType,
  warehouseCapacity,
} from "@heat/engine";

import { configFromEnv, createDocumentClient, type Tables } from "../src/db/client.js";
import { type Hero, HeroChanged, Repository, type Settlement, TransactionConflict } from "../src/db/repository.js";
import { discardAdventure } from "../src/discard.js";
import { logger } from "../src/observability.js";
import { AdventureDiscarded, AdventureSettled, AdventureVerifiable, Conflict, EngineUpdated } from "../src/refusals.js";
import { startAdventure } from "../src/start.js";
import { SETTLE_ATTEMPTS, submitAdventure } from "../src/submit.js";
import { MemoryTimelines } from "../src/timelines.js";
import { player, putParty as putPartyAt, storedItem } from "./data.js";
import { locationKeys, playerKeys } from "./keys.js";
import { cancelled, everyInterleaving, type Race, winnerBefore } from "./race.js";
import { BAD_USER_INPUT, refusal } from "./refusal.js";
import { PREVIOUS_VERSION as previous, VERSION as version } from "./versions.js";

/**
 * Submit, settlement and discard against DynamoDB Local, with the replay
 * bucket in memory (src/timelines.ts): the result is the hub's replay; XP
 * and levels; what dropped credited beside the pay, one holding and one
 * ledger entry for each resource, and what a retreat keeps of both (decision
 * 0058); a job that varies settled as its seed rolls it (Issue-341);
 * credits capped at the warehouse with the loss in the ledger;
 * a death with the camp's living count and the sighting; a repeated and a
 * concurrent submit that pay once; the adventure's item in its location's
 * feed, which a discard never writes (decision 0050); a balance moved during settlement; a
 * stored timeline that wins; and a discard that only an unverifiable
 * adventure gets.
 *
 * The outcomes are the engine's for these seeds, checked against `replay`
 * in each test rather than assumed: a fighter and a villager clear the
 * wolves unharmed, and a lone villager does not survive them.
 */

let db: DynamoDBDocumentClient;
let tables: Tables;
let repo: Repository;

beforeAll(() => {
  const config = configFromEnv();
  db = createDocumentClient(config);
  tables = config.tables;
  repo = new Repository(db, tables);
});

const at = "millbrook";
const wolves = JOBS["wolves-on-the-mill-road"];
/** What the wolves job gives a hero that arrives: its two wolves' XP and its bonus (decision 0058). */
const WOLVES_XP = 2 * MONSTERS.wolf.xp + wolves.bonusXp;
const timber = JOBS["timber-from-the-near-woods"];
const sticks = JOBS["pick-up-sticks"];

/** Living heroes of the given unit types and a camp that counts them, with their sightings. */
const putParty = (p: string, unitTypes: UnitType[]): Promise<Hero[]> => putPartyAt(db, tables, p, unitTypes, at);

/** Starts the job for the party; with `seed`, on that seed and not one the hub draws (graphql.md, rule 25). */
async function start(p: string, heroes: Hero[], issuedBy = version, jobId: string = wolves.id, seed?: string) {
  return startAdventure(repo, p, issuedBy, randomUUID(), at, jobId, heroes.map((h) => h.id), undefined, seed === undefined ? undefined : () => seed);
}

async function balanceOf(p: string, material: string) {
  return (await repo.holdings(p, at)).find((h) => h.material === material)?.balance;
}


/** The location's feed items for the adventure, read past the repository: one once it is settled, none before or after a discard. */
async function inFeed(adventureId: string) {
  const r = await db.send(new QueryCommand({
    TableName: tables.location,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :done)",
    FilterExpression: "adventureId = :id",
    ExpressionAttributeValues: { ":pk": `LOCATION#${at}`, ":done": "DONE#", ":id": adventureId },
    ConsistentRead: true,
  }));
  expect(r.LastEvaluatedKey).toBeUndefined();
  return r.Items ?? [];
}

async function cloth(p: string) {
  return (await repo.holdings(p, at)).find((h) => h.material === "cloth")?.balance;
}

describe("a party that completes the job", () => {
  it("is paid, gains its XP and level, comes home, and is seen again", async () => {
    const p = player();
    const heroes = await putParty(p, ["fighter", "villager"]);
    const started = await start(p, heroes);
    const expected = replay(started.snapshot, started.seed, []).result;
    expect(expected.outcome).toBe("complete");
    expect(expected.dead).toEqual([]);

    const timelines = new MemoryTimelines();
    const settled = await submitAdventure(repo, timelines, p, version, started.adventureId, []);

    expect(settled.status).toBe("SETTLED");
    expect(settled.result?.outcome).toBe("complete");
    expect(settled.result?.rewards).toEqual(wolves.pay);
    expect(settled.result?.credited).toEqual(wolves.pay);
    expect(settled.result?.lost).toEqual([]);
    expect(await repo.getAdventure(started.adventureId)).toMatchObject({ status: "SETTLED", result: settled.result });
    expect(await repo.openAdventure(p)).toBeUndefined();
    expect(await cloth(p)).toBe(10);
    expect(await storedItem(db, tables.player, playerKeys.ledger(p, started.adventureId, "credit#cloth"))).toMatchObject({ delta: 10, lost: 0 });

    expect(WOLVES_XP).toBe(20);
    const level = levelForXp(WOLVES_XP);
    expect(level).toBeGreaterThan(1);
    for (const hero of heroes) {
      expect(await repo.getHero(p, hero.id)).toMatchObject({ xp: WOLVES_XP, level, status: "ALIVE", adventureId: null });
      const seen = await storedItem(db, tables.location, locationKeys.seen(at, hero.id));
      expect(seen).toMatchObject({ level, name: hero.name });
      expect(seen?.["expiresAt"]).toBeGreaterThan(Date.now() / 1000);
    }
    expect(settled.result?.heroes.map((h) => [h.xpGained, h.level, h.dead])).toEqual(heroes.map(() => [WOLVES_XP, level, false]));

    const stored = JSON.parse(must(timelines.objects.get(started.adventureId), "the stored timeline")) as AdventureTimeline;
    expect(stored).toEqual(JSON.parse(JSON.stringify(replay(started.snapshot, started.seed, []).timeline)));
    expect(stored.version).toBe(version);
  });

  it("is put in its location's feed as it settles, by its public fields and with no owner, expiring a week later", async () => {
    const p = player();
    const heroes = await putParty(p, ["fighter", "villager"]);
    const started = await start(p, heroes);
    expect(await inFeed(started.adventureId)).toEqual([]);
    const now = new Date();
    const settled = await submitAdventure(repo, new MemoryTimelines(), p, version, started.adventureId, [], now);

    const key = locationKeys.done(at, now.toISOString(), started.adventureId);
    const item = await storedItem(db, tables.location, key);
    const level = levelForXp(WOLVES_XP);
    const stages = must(settled.result, "the result").stages;
    expect(stages.length).toBeGreaterThan(0);
    expect(item).toEqual({
      ...key,
      adventureId: started.adventureId,
      location: at,
      jobId: wolves.id,
      outcome: "complete",
      stages,
      credited: wolves.pay,
      party: heroes.map((hero) => ({ name: hero.name, unitType: hero.unitType, spriteSet: hero.spriteSet, level, died: false })),
      settledAt: now.toISOString(),
      expiresAt: Math.floor(now.getTime() / 1000) + 7 * 24 * 60 * 60,
      // ElectroDB's identifiers, which say what the item is and nothing of whose (decision 0041).
      __edb_e__: "recent",
      __edb_v__: "1",
    });
    const stored = JSON.stringify(item);
    expect(stored).not.toContain(p);
    for (const hero of heroes) expect(stored).not.toContain(hero.id);
  });

  it("pays once when the same submit is repeated, and once when two race", async () => {
    const p = player();
    const heroes = await putParty(p, ["fighter", "villager"]);
    const first = await start(p, heroes);
    const timelines = new MemoryTimelines();
    const settled = await submitAdventure(repo, timelines, p, version, first.adventureId, []);
    const repeat = await submitAdventure(repo, timelines, p, version, first.adventureId, []);
    expect(repeat.result).toEqual(settled.result);
    expect(await cloth(p)).toBe(10);
    expect(await inFeed(first.adventureId)).toHaveLength(1);

    const second = await start(p, heroes);
    const both = await Promise.all([
      submitAdventure(repo, timelines, p, version, second.adventureId, []),
      submitAdventure(repo, timelines, p, version, second.adventureId, []),
    ]);
    expect(both.map((r) => r.status)).toEqual(["SETTLED", "SETTLED"]);
    expect(await inFeed(second.adventureId)).toHaveLength(1);
    expect(await cloth(p)).toBe(20);
    for (const hero of heroes) expect((await repo.getHero(p, hero.id))?.xp).toBe(2 * WOLVES_XP);
  });

  /**
   * A submit raced by its own repeat, which commits as `race` places it:
   * the loser answers the record as settled, and the camp is paid once. A
   * party of one, so that no read of the party runs beside another (race.ts).
   */
  async function lostSubmit(race: (p: string, adventureId: string, winner: () => Promise<unknown>) => Race): Promise<boolean> {
    const p = player();
    const started = await start(p, await putParty(p, ["fighter"]));
    const timelines = new MemoryTimelines();
    const late = race(p, started.adventureId, () => submitAdventure(repo, timelines, p, version, started.adventureId, []));
    const lost = await submitAdventure(late.repo, timelines, p, version, started.adventureId, []);
    const stored = must(await repo.getAdventure(started.adventureId), "the record");
    expect(stored.status).toBe("SETTLED");
    expect(lost.result).toEqual(stored.result);
    expect(await cloth(p)).toBe(stored.result?.credited.find((c) => c.material === "cloth")?.amount);
    return late.ran();
  }

  it("answers a repeat that loses the race with the record settled, wherever the other commits", async () => {
    const runs = await everyInterleaving((k) => lostSubmit((_p, _id, winner) => winnerBefore(repo, k, winner)));
    // Before each of getAdventure, camp, getHero and settle.
    expect(runs).toBe(4);
  });

  it("retries a settlement cancelled by its repeat in flight, and answers the record settled", async () => {
    const runs = await everyInterleaving((k) => lostSubmit((_p, _id, winner) => cancelled(repo, "settle", new TransactionConflict("conflict"), k, winner)));
    // Before each of the next attempt's camp, getHero and settle.
    expect(runs).toBe(3);
  });

  it("waits only before an attempt that follows, and then answers Conflict", async () => {
    const p = player();
    const started = await start(p, await putParty(p, ["fighter"]));
    const settle = vi.spyOn(Repository.prototype, "settle").mockRejectedValue(new TransactionConflict("conflict"));
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    try {
      expect(await refusal(submitAdventure(repo, new MemoryTimelines(), p, version, started.adventureId, []))).toBeInstanceOf(Conflict);
      expect(settle).toHaveBeenCalledTimes(SETTLE_ATTEMPTS);
      expect(warn.mock.calls.filter(([message]) => message === "transaction conflict; running again")).toHaveLength(SETTLE_ATTEMPTS - 1);
    } finally {
      settle.mockRestore();
      warn.mockRestore();
    }
  });
});

describe("the warehouse's cap", () => {
  it("credits up to the cap and records what it lost", async () => {
    const p = player();
    const heroes = await putParty(p, ["fighter", "villager"]);
    const cap = warehouseCapacity(1);
    await repo.setBalance(p, at, "cloth", cap - 4);
    const started = await start(p, heroes);
    const settled = await submitAdventure(repo, new MemoryTimelines(), p, version, started.adventureId, []);
    expect(settled.result?.credited).toEqual([{ material: "cloth", amount: 4 }]);
    expect(settled.result?.lost).toEqual([{ material: "cloth", amount: 6 }]);
    expect(await cloth(p)).toBe(cap);
    expect(await storedItem(db, tables.player, playerKeys.ledger(p, started.adventureId, "credit#cloth"))).toMatchObject({ delta: 4, lost: 6 });
  });

  it("credits nothing to a full warehouse and still settles", async () => {
    const p = player();
    const heroes = await putParty(p, ["fighter", "villager"]);
    const cap = warehouseCapacity(1);
    await repo.setBalance(p, at, "cloth", cap);
    const started = await start(p, heroes);
    const settled = await submitAdventure(repo, new MemoryTimelines(), p, version, started.adventureId, []);
    expect(settled.result?.credited).toEqual([]);
    expect(settled.result?.lost).toEqual(wolves.pay);
    expect(await cloth(p)).toBe(cap);
    expect(await storedItem(db, tables.player, playerKeys.ledger(p, started.adventureId, "credit#cloth"))).toMatchObject({ delta: 0, lost: 10 });
  });

  it("reads again when a balance moves between the read and the write", async () => {
    const p = player();
    const heroes = await putParty(p, ["fighter", "villager"]);
    const started = await start(p, heroes);
    let moved = false;
    // A debit lands after settlement read the camp and before it wrote.
    const racing = new (class extends Repository {
      override async settle(playerId: string, s: Settlement, now?: Date): Promise<void> {
        if (!moved) {
          moved = true;
          await repo.setBalance(p, at, "cloth", warehouseCapacity(1) - 3);
        }
        return super.settle(playerId, s, now);
      }
    })(db, tables);
    const settled = await submitAdventure(racing, new MemoryTimelines(), p, version, started.adventureId, []);
    expect(moved).toBe(true);
    expect(settled.result?.credited).toEqual([{ material: "cloth", amount: 3 }]);
    expect(await cloth(p)).toBe(warehouseCapacity(1));
  });
});

describe("a death", () => {
  it("sets the hero dead, counts it out of the living, deletes its sighting and credits nothing", async () => {
    const p = player();
    const villager = must((await putParty(p, ["villager"]))[0], "the villager");
    const started = await start(p, [villager]);
    expect(replay(started.snapshot, started.seed, []).result.dead).toEqual([villager.id]);

    const settled = await submitAdventure(repo, new MemoryTimelines(), p, version, started.adventureId, []);
    expect(settled.result?.outcome).toBe("defeat");
    expect(settled.result?.credited).toEqual([]);
    expect(settled.result?.heroes).toEqual([expect.objectContaining({ heroId: villager.id, dead: true, xpGained: 0, health: 0 })]);
    expect(await repo.getHero(p, villager.id)).toMatchObject({ status: "DEAD", xp: 0, level: 1, adventureId: null });
    expect(await repo.camp(p, at)).toMatchObject({ livingHeroes: 0, activeHeroes: 1 });
    expect(await storedItem(db, tables.location, locationKeys.seen(at, villager.id))).toBeUndefined();
    expect(await repo.holdings(p, at)).toEqual([]);
    // A defeat is in the feed like any outcome, its hero at the level it died at.
    expect(await inFeed(started.adventureId)).toEqual([
      expect.objectContaining({ outcome: "defeat", credited: [], party: [{ name: villager.name, unitType: "villager", spriteSet: villager.spriteSet, level: 1, died: true }] }),
    ]);
  });
});

describe("what verifies an adventure", () => {
  it("refuses another version with EngineUpdated and this deploy's version, writing nothing", async () => {
    const p = player();
    const heroes = await putParty(p, ["fighter", "villager"]);
    const started = await start(p, heroes, previous);
    const timelines = new MemoryTimelines();
    const refused = await refusal(submitAdventure(repo, timelines, p, version, started.adventureId, []));
    expect(refused).toBeInstanceOf(EngineUpdated);
    expect(refused).toMatchObject({ version });
    expect(timelines.objects.size).toBe(0);
    expect((await repo.getAdventure(started.adventureId))?.status).toBe("OPEN");
  });

  it("refuses another player's adventure as if it did not exist", async () => {
    const p = player();
    const started = await start(p, await putParty(p, ["villager"]));
    expect(await refusal(submitAdventure(repo, new MemoryTimelines(), player(), version, started.adventureId, []))).toMatchObject(BAD_USER_INPUT);
  });

  it("refuses a log entry for a unit outside the party", async () => {
    const p = player();
    const started = await start(p, await putParty(p, ["villager"]));
    const log = [{ kind: "UNIT" as const, acceptedAtSimTime: 5000, unitId: "s1-wolf-1", abilityId: "bite" }];
    expect(await refusal(submitAdventure(repo, new MemoryTimelines(), p, version, started.adventureId, log))).toMatchObject(BAD_USER_INPUT);
  });

  it("settles with the timeline already stored, so the record and the replay agree", async () => {
    const p = player();
    const heroes = await putParty(p, ["fighter", "villager"]);
    const started = await start(p, heroes);
    // A retreat ordered at the start: the run ends at the first stage's end,
    // paid nothing, and with no enemy down, no XP. Stored first, as a submit
    // that lost its transaction would have left it.
    const retreat = [{ kind: "party" as const, acceptedAtSimTime: 0, order: "retreat" as const }];
    const stored = replay(started.snapshot, started.seed, retreat);
    expect(stored.result.outcome).toBe("retreat");
    const timelines = new MemoryTimelines();
    await timelines.putIfAbsent(started.adventureId, JSON.stringify(stored.timeline));

    const settled = await submitAdventure(repo, timelines, p, version, started.adventureId, []);
    expect(settled.result?.outcome).toBe("retreat");
    expect(settled.result?.credited).toEqual([]);
    for (const hero of heroes) expect((await repo.getHero(p, hero.id))?.xp).toBe(0);
  });
});

describe("what dropped (decision 0058)", () => {
  const tree = must(must(RESOURCE_NODES.tree.drops[0], "the tree's drop").levels[0], "its row at woodcutting 1");

  it("is credited beside the pay, one holding and one ledger entry for each resource, with the enemies' XP and the bonus", async () => {
    const p = player();
    const heroes = await putParty(p, ["villager", "villager"]);
    const started = await start(p, heroes, version, timber.id);
    const expected = replay(started.snapshot, started.seed, []).result;
    expect(expected.outcome).toBe("complete");

    const settled = await submitAdventure(repo, new MemoryTimelines(), p, version, started.adventureId, []);
    const dropped = must(settled.result?.rewards.find((r) => r.material === "timber"), "the timber").amount;
    // Two trees, each dropping at a villager's level.
    expect(dropped).toBeGreaterThanOrEqual(2 * tree.min);
    expect(dropped).toBeLessThanOrEqual(2 * tree.max);
    expect(settled.result?.rewards).toEqual([{ material: "timber", amount: dropped }, ...timber.pay]);
    expect(settled.result?.rewards).toEqual(expected.rewards);
    expect(settled.result?.credited).toEqual(settled.result?.rewards);
    expect(settled.result?.lost).toEqual([]);
    expect(await balanceOf(p, "timber")).toBe(dropped);
    expect(await balanceOf(p, "cloth")).toBe(3);
    expect(await storedItem(db, tables.player, playerKeys.ledger(p, started.adventureId, "credit#timber"))).toMatchObject({ delta: dropped, lost: 0 });
    expect(await storedItem(db, tables.player, playerKeys.ledger(p, started.adventureId, "credit#cloth"))).toMatchObject({ delta: 3, lost: 0 });
    // Two trees, a wolf and the bonus: what the job gave before its enemies had XP.
    const earned = 2 * RESOURCE_NODES.tree.xp + MONSTERS.wolf.xp + timber.bonusXp;
    expect(earned).toBe(15);
    for (const hero of heroes) expect((await repo.getHero(p, hero.id))?.xp).toBe(earned);
  });

  it("is kept by a retreat, with the XP of the enemies that went down, and neither the pay nor the bonus", async () => {
    const p = player();
    const heroes = await putParty(p, ["villager", "villager"]);
    const started = await start(p, heroes, version, timber.id);
    const whole = replay(started.snapshot, started.seed, []).result;
    // Ordered a moment before the last tree falls, so the stage's end makes the retreat certain: both trees are down, and the wolf is never met.
    const at_ = must(whole.stages[1], "the gather stage").endedAtMs - 100;
    const expected = replay(started.snapshot, started.seed, [{ kind: "party", acceptedAtSimTime: at_, order: "retreat" }]).result;
    expect(expected.outcome).toBe("retreat");

    const settled = await submitAdventure(repo, new MemoryTimelines(), p, version, started.adventureId, [{ kind: "PARTY", acceptedAtSimTime: at_, order: "RETREAT" }]);
    expect(settled.result?.outcome).toBe("retreat");
    const dropped = must(whole.rewards.find((r) => r.material === "timber"), "the timber").amount;
    expect(settled.result?.credited).toEqual([{ material: "timber", amount: dropped }]);
    expect(await balanceOf(p, "timber")).toBe(dropped);
    expect(await balanceOf(p, "cloth")).toBeUndefined();
    expect(await storedItem(db, tables.player, playerKeys.ledger(p, started.adventureId, "credit#cloth"))).toBeUndefined();
    for (const hero of heroes) expect((await repo.getHero(p, hero.id))?.xp).toBe(2 * RESOURCE_NODES.tree.xp);
  });

  it("is nothing for a party with no carrier of the drop's trait, which is still paid and still earns its XP", async () => {
    const p = player();
    const heroes = await putParty(p, ["fighter"]);
    const started = await start(p, heroes, version, timber.id);
    expect(replay(started.snapshot, started.seed, []).result.outcome).toBe("complete");

    const settled = await submitAdventure(repo, new MemoryTimelines(), p, version, started.adventureId, []);
    expect(settled.result?.credited).toEqual(timber.pay);
    expect(await balanceOf(p, "timber")).toBeUndefined();
    expect(await storedItem(db, tables.player, playerKeys.ledger(p, started.adventureId, "credit#timber"))).toBeUndefined();
    expect((await repo.getHero(p, must(heroes[0], "the fighter").id))?.xp).toBe(15);
  });

  it("credits the wolf's hide to a party with a ranger, a holding and a ledger entry of its own beside the cloth, and none to a party without one (Issue-340)", async () => {
    // A wolf drops hide half the time, so the test passes a seed on which both of this job's wolves do:
    // the roll is the wolf's own, from the seed, the stage and its id, whoever the heroes are.
    const seed = "hide";
    const p = player();
    const heroes = await putParty(p, ["fighter", "ranger"]);
    const started = await start(p, heroes, version, wolves.id, seed);
    expect(started.seed).toBe(seed);
    expect(started.snapshot.heroes.map((h) => h.stats.traits)).toEqual([[], [{ trait: "skinning", level: 1 }]]);
    const expected = replay(started.snapshot, started.seed, []).result;
    expect(expected.outcome).toBe("complete");
    const hide = must(expected.rewards.find((r) => r.material === "hide"), "the hide").amount;
    expect(hide).toBe(2);

    const settled = await submitAdventure(repo, new MemoryTimelines(), p, version, started.adventureId, []);
    expect(settled.result?.rewards).toEqual([...wolves.pay, { material: "hide", amount: hide }]);
    expect(settled.result?.credited).toEqual(settled.result?.rewards);
    expect(settled.result?.lost).toEqual([]);
    expect(await balanceOf(p, "hide")).toBe(hide);
    expect(await balanceOf(p, "cloth")).toBe(10);
    expect(await storedItem(db, tables.player, playerKeys.ledger(p, started.adventureId, "credit#hide"))).toMatchObject({ delta: hide, lost: 0 });
    expect(await storedItem(db, tables.player, playerKeys.ledger(p, started.adventureId, "credit#cloth"))).toMatchObject({ delta: 10, lost: 0 });
    for (const hero of heroes) expect((await repo.getHero(p, hero.id))?.xp).toBe(WOLVES_XP);

    // The same job on the same seed with a villager in the ranger's place: the wolves fall, and no hide is credited.
    const q = player();
    const others = await putParty(q, ["fighter", "villager"]);
    const without = await start(q, others, version, wolves.id, seed);
    expect(replay(without.snapshot, without.seed, []).result.outcome).toBe("complete");
    const paid = await submitAdventure(repo, new MemoryTimelines(), q, version, without.adventureId, []);
    expect(paid.result?.credited).toEqual(wolves.pay);
    expect(await balanceOf(q, "hide")).toBeUndefined();
    expect(await storedItem(db, tables.player, playerKeys.ledger(q, without.adventureId, "credit#hide"))).toBeUndefined();
  });

  it("settles a job that varies as its seed rolls it: the first job's wolf, its XP and a ranger's hide on a seed that has one, and none of them on a seed that has not (Issue-341)", async () => {
    // The record holds the job's id and the seed, and nothing of the roll: the hub's replay expands the stages again.
    // The seeds are picked by asking the engine what each gives, not by restating how it draws (graphql.md, rule 26):
    // who the job sets against a party is its expansion, and what a ranger and a villager bring home is a replay
    // with a stand-in party of those two types, since a roll does not read who the heroes are.
    const seeds = range(2000).map((i) => `varies-${String(i)}`);
    const types = ["ranger", "villager"] as const satisfies readonly UnitType[];
    const standIn: AdventureSnapshot = {
      version,
      jobId: sticks.id,
      heroes: types.map((unitType) => ({
        heroId: `stand-in-${unitType}`, unitType, name: unitType, spriteSet: `${unitType}-01`, level: 1, stats: must(UNIT_PROFILES[unitType], `the ${unitType}'s profile`).stats,
      })),
    };
    const wolfIn = (seed: string) => expandStages(sticks, seed).some((stage) => "opponents" in stage && stage.opponents.some((o) => o.type === "wolf"));
    // A wolf's hide falls half the time at skinning 1, so the seed with the wolf is one where it does.
    const hideOn = (seed: string) => replay(standIn, seed, []).result.rewards.some((r) => r.material === "hide");
    const withWolf = must(seeds.find((seed) => wolfIn(seed) && hideOn(seed)), "a seed with the wolf and its hide");
    const quiet = must(seeds.find((seed) => !wolfIn(seed)), "a seed without the wolf");

    for (const [seed, wolf] of [[withWolf, true], [quiet, false]] as const) {
      const p = player();
      const heroes = await putParty(p, [...types]);
      const started = await start(p, heroes, version, sticks.id, seed);
      expect(started.snapshot.jobId, seed).toBe(sticks.id);
      const timelines = new MemoryTimelines();
      const settled = await submitAdventure(repo, timelines, p, version, started.adventureId, []);
      expect(settled.result?.outcome, seed).toBe("complete");

      const stored = JSON.parse(must(timelines.objects.get(started.adventureId), "the stored timeline")) as AdventureTimeline;
      const met = stored.events.flatMap((e) => (e.kind === "battle-start" ? e.participants.filter((x) => x.side === "opponents").map((x) => x.type) : []));
      expect(met, seed).toEqual(wolf ? ["tree", "wolf"] : ["tree"]);

      const xp = RESOURCE_NODES.tree.xp + sticks.bonusXp + (wolf ? MONSTERS.wolf.xp : 0);
      expect(xp, seed).toBe(wolf ? 10 : 5);
      for (const hero of heroes) expect((await repo.getHero(p, hero.id))?.xp, seed).toBe(xp);
      expect(settled.result?.credited.map((r) => r.material), seed).toEqual(wolf ? ["timber", "hide"] : ["timber"]);
      expect(await balanceOf(p, "hide"), seed).toBe(wolf ? 1 : undefined);
      expect(await balanceOf(p, "timber"), seed).toBeGreaterThanOrEqual(30);
    }
  });

  it("is capped by the warehouse like the pay, each resource on its own balance", async () => {
    const p = player();
    const heroes = await putParty(p, ["villager", "villager"]);
    const cap = warehouseCapacity(1);
    await repo.setBalance(p, at, "timber", cap - 10);
    const started = await start(p, heroes, version, timber.id);
    const settled = await submitAdventure(repo, new MemoryTimelines(), p, version, started.adventureId, []);
    const dropped = must(settled.result?.rewards.find((r) => r.material === "timber"), "the timber").amount;
    expect(settled.result?.credited).toEqual([{ material: "timber", amount: 10 }, ...timber.pay]);
    expect(settled.result?.lost).toEqual([{ material: "timber", amount: dropped - 10 }]);
    expect(await balanceOf(p, "timber")).toBe(cap);
    expect(await storedItem(db, tables.player, playerKeys.ledger(p, started.adventureId, "credit#timber"))).toMatchObject({ delta: 10, lost: dropped - 10 });
  });
});

describe("discard", () => {
  it("refuses an adventure this deploy or the previous one can verify", async () => {
    for (const issuedBy of [version, previous]) {
      const p = player();
      const started = await start(p, await putParty(p, ["villager"]), issuedBy);
      const refused = await refusal(discardAdventure(repo, p, { current: version, previous }, started.adventureId));
      expect(refused).toBeInstanceOf(AdventureVerifiable);
      expect(refused).toMatchObject({ version: issuedBy });
      expect((await repo.getAdventure(started.adventureId))?.status).toBe("OPEN");
    }
  });

  it("closes an older adventure with nothing credited and the party at the camp", async () => {
    const p = player();
    const heroes = await putParty(p, ["fighter", "villager"]);
    const started = await start(p, heroes, "0".repeat(40));
    const versions = { current: version, previous };
    const discarded = await discardAdventure(repo, p, versions, started.adventureId);
    expect(discarded.status).toBe("DISCARDED");
    expect(await repo.openAdventure(p)).toBeUndefined();
    expect(await repo.getAdventure(started.adventureId)).toMatchObject({ status: "DISCARDED" });
    for (const hero of heroes) expect(await repo.getHero(p, hero.id)).toMatchObject({ adventureId: null, xp: 0, status: "ALIVE" });
    expect(await repo.holdings(p, at)).toEqual([]);
    expect(await inFeed(started.adventureId)).toEqual([]);

    expect((await discardAdventure(repo, p, versions, started.adventureId)).discardedAt).toBe(discarded.discardedAt);
    expect(await refusal(submitAdventure(repo, new MemoryTimelines(), p, "0".repeat(40), started.adventureId, []))).toBeInstanceOf(AdventureDiscarded);
    // The party can set out again.
    expect((await start(p, heroes)).status).toBe("OPEN");
  });

  it("refuses a settled adventure", async () => {
    const p = player();
    const started = await start(p, await putParty(p, ["fighter", "villager"]));
    await submitAdventure(repo, new MemoryTimelines(), p, version, started.adventureId, []);
    expect(await refusal(discardAdventure(repo, p, { current: "1".repeat(40), previous: undefined }, started.adventureId))).toBeInstanceOf(AdventureSettled);
  });

  it("answers a repeat that loses the race with the adventure discarded, wherever the other commits (Issue-172)", async () => {
    const versions = { current: version, previous };
    const runs = await everyInterleaving(async (k) => {
      const p = player();
      const heroes = await putParty(p, ["fighter", "villager"]);
      const started = await start(p, heroes, "0".repeat(40));
      const late = winnerBefore(repo, k, () => discardAdventure(repo, p, versions, started.adventureId));
      expect(await discardAdventure(late.repo, p, versions, started.adventureId)).toMatchObject({ status: "DISCARDED" });
      expect(await repo.openAdventure(p)).toBeUndefined();
      for (const hero of heroes) expect(await repo.getHero(p, hero.id)).toMatchObject({ adventureId: null });
      return late.ran();
    });
    // Before each of getAdventure and discard.
    expect(runs).toBe(2);
  });

  it("retries a discard cancelled by another in flight, and answers the discard that won (Issue-172)", async () => {
    const versions = { current: version, previous };
    const runs = await everyInterleaving(async (k) => {
      const p = player();
      const started = await start(p, await putParty(p, ["villager"]), "0".repeat(40));
      const late = cancelled(repo, "discard", new TransactionConflict("conflict"), k, () => discardAdventure(repo, p, versions, started.adventureId));
      expect(await discardAdventure(late.repo, p, versions, started.adventureId)).toMatchObject({ status: "DISCARDED" });
      return late.ran();
    });
    // Before each of the retry's getAdventure and discard.
    expect(runs).toBe(2);
  });

  it("retries a discard cancelled by a submit in flight, and refuses with AdventureSettled (Issue-172)", async () => {
    const runs = await everyInterleaving(async (k) => {
      const p = player();
      const started = await start(p, await putParty(p, ["fighter", "villager"]), "0".repeat(40));
      const settle = () => submitAdventure(repo, new MemoryTimelines(), p, "0".repeat(40), started.adventureId, []);
      const late = cancelled(repo, "discard", new TransactionConflict("conflict"), k, settle);
      const lost = await refusal(discardAdventure(late.repo, p, { current: version, previous }, started.adventureId));
      // Past the last call the submit never commits, and the discard is the one that wins.
      if (!late.ran()) return false;
      expect(lost).toBeInstanceOf(AdventureSettled);
      return true;
    });
    expect(runs).toBe(2);
  });

  it("answers Conflict when the adventure is still open and no rule explains the failure (Issue-172)", async () => {
    const p = player();
    const started = await start(p, await putParty(p, ["villager"]), "0".repeat(40));
    const changed = cancelled(repo, "discard", new HeroChanged("condition failed on item 2"), 1, () => Promise.resolve());
    expect(await refusal(discardAdventure(changed.repo, p, { current: version, previous }, started.adventureId))).toBeInstanceOf(Conflict);
    expect((await repo.getAdventure(started.adventureId))?.status).toBe("OPEN");
  });
});

describe("the level table", () => {
  it("raises a level at each threshold and never past the last", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(must(LEVEL_XP[1], "the second level's threshold"))).toBe(2);
    expect(levelForXp(1_000_000)).toBe(LEVEL_XP.length);
  });
});
