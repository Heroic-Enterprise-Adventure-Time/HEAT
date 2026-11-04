import { randomUUID } from "node:crypto";

import { type DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { type AdventureTimeline, JOBS, LEVEL_XP, levelForXp, must, replay, type UnitType, warehouseCapacity } from "@heat/engine";

import { configFromEnv, createDocumentClient, type Tables } from "../src/db/client.js";
import { type Hero, HeroChanged, Repository, type Settlement, TransactionConflict } from "../src/db/repository.js";
import { discardAdventure } from "../src/discard.js";
import { logger } from "../src/observability.js";
import { AdventureDiscarded, AdventureSettled, AdventureVerifiable, Conflict, EngineUpdated } from "../src/refusals.js";
import { startAdventure } from "../src/start.js";
import { SETTLE_ATTEMPTS, submitAdventure } from "../src/submit.js";
import { MemoryTimelines } from "../src/timelines.js";
import { player, storedItem, whole } from "./data.js";
import { locationKeys, playerKeys } from "./keys.js";
import { cancelled, everyInterleaving, type Race, winnerBefore } from "./race.js";
import { BAD_USER_INPUT, refusal } from "./refusal.js";

/**
 * Submit, settlement and discard against DynamoDB Local, with the replay
 * bucket in memory (src/timelines.ts): the result is the hub's replay; XP
 * and levels; credits capped at the warehouse with the loss in the ledger;
 * a death with the camp's living count and the sighting; a repeated and a
 * concurrent submit that pay once; a balance moved during settlement; a
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
const version = "0123456789abcdef0123456789abcdef01234567";
const previous = "fedcba9876543210fedcba9876543210fedcba98";

/** Living heroes of the given unit types and a camp that counts them, with their sightings. */
async function putParty(p: string, unitTypes: UnitType[], warehouseLevel = 1): Promise<Hero[]> {
  const heroes = unitTypes.map((unitType, i): Hero => ({
    id: randomUUID(), location: at, unitType, spriteSet: `${unitType}-01`, name: `Hero ${i}`,
    recruitedAt: new Date().toISOString(), level: 1, xp: 0, picks: [], status: "ALIVE", retiredAt: null, adventureId: null,
  }));
  for (const hero of heroes) {
    await db.send(new PutCommand({ TableName: tables.player, Item: whole("hero", { ...playerKeys.hero(p, hero.id), ...hero }) }));
    await db.send(new PutCommand({
      TableName: tables.location,
      Item: whole("sighting", { ...locationKeys.seen(at, hero.id), heroId: hero.id, level: 1, seenAt: "2026-01-01T00:00:00.000Z", expiresAt: 1 }),
    }));
  }
  await db.send(new PutCommand({
    TableName: tables.player,
    Item: whole("camp", { ...playerKeys.camp(p, at), location: at, hallLevel: 1, warehouseLevel, activeHeroes: heroes.length, livingHeroes: heroes.length }),
  }));
  return heroes;
}

async function start(p: string, heroes: Hero[], issuedBy = version) {
  return startAdventure(repo, p, issuedBy, at, wolves.id, heroes.map((h) => h.id));
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

    const level = levelForXp(wolves.xp);
    expect(level).toBeGreaterThan(1);
    for (const hero of heroes) {
      expect(await repo.getHero(p, hero.id)).toMatchObject({ xp: wolves.xp, level, status: "ALIVE", adventureId: null });
      const seen = await storedItem(db, tables.location, locationKeys.seen(at, hero.id));
      expect(seen).toMatchObject({ level, name: hero.name });
      expect(seen?.["expiresAt"]).toBeGreaterThan(Date.now() / 1000);
    }
    expect(settled.result?.heroes.map((h) => [h.xpGained, h.level, h.dead])).toEqual(heroes.map(() => [wolves.xp, level, false]));

    const stored = JSON.parse(must(timelines.objects.get(started.adventureId), "the stored timeline")) as AdventureTimeline;
    expect(stored).toEqual(JSON.parse(JSON.stringify(replay(started.snapshot, started.seed, []).timeline)));
    expect(stored.version).toBe(version);
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

    const second = await start(p, heroes);
    const both = await Promise.all([
      submitAdventure(repo, timelines, p, version, second.adventureId, []),
      submitAdventure(repo, timelines, p, version, second.adventureId, []),
    ]);
    expect(both.map((r) => r.status)).toEqual(["SETTLED", "SETTLED"]);
    expect(await cloth(p)).toBe(20);
    for (const hero of heroes) expect((await repo.getHero(p, hero.id))?.xp).toBe(2 * wolves.xp);
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
    // paid nothing, with half the XP. Stored first, as a submit that lost
    // its transaction would have left it.
    const retreat = [{ kind: "party" as const, acceptedAtSimTime: 0, order: "retreat" as const }];
    const stored = replay(started.snapshot, started.seed, retreat);
    expect(stored.result.outcome).toBe("retreat");
    const timelines = new MemoryTimelines();
    await timelines.putIfAbsent(started.adventureId, JSON.stringify(stored.timeline));

    const settled = await submitAdventure(repo, timelines, p, version, started.adventureId, []);
    expect(settled.result?.outcome).toBe("retreat");
    expect(settled.result?.credited).toEqual([]);
    const half = (wolves.xp * wolves.retreat.xpPercent) / 100;
    for (const hero of heroes) expect((await repo.getHero(p, hero.id))?.xp).toBe(half);
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
