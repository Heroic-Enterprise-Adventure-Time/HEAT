import { randomUUID } from "node:crypto";

import { type CancellationReason, TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { type DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { Entity, Service } from "electrodb";
import { beforeAll, describe, expect, it } from "vitest";

import { must, UNIT_PROFILES, UNLOCK_IDS } from "@heat/engine";

import { configFromEnv, createDocumentClient, type Tables } from "../src/db/client.js";
import { createService, type HeatService } from "../src/db/entities.js";
import { type Hero, HeroChanged, Repository, TransactionConflict } from "../src/db/repository.js";
import { emptyResult, heroFixture, player, putOldCampsPastAPage, settledAdventure, storedItem, whole } from "./data.js";
import { locationKeys, playerKeys } from "./keys.js";

/**
 * What decision 0041 rests on, against DynamoDB Local: how ElectroDB meets
 * items the hand-written repository wrote, the transaction across the two
 * tables, and the reads the repository makes. The old items here are written as
 * that code wrote them, without identifiers or the keys' composite attributes.
 */

let db: DynamoDBDocumentClient;
let tables: Tables;
let service: HeatService;
let repo: Repository;

beforeAll(() => {
  const config = configFromEnv();
  db = createDocumentClient(config);
  tables = config.tables;
  service = createService(db, tables);
  repo = new Repository(db, tables);
});

const at = "millbrook";

const oldHero = (id: string): Hero => heroFixture(at, { id, name: "Old", recruitedAt: "2026-10-21T12:00:00.000Z" });

async function putOldHero(p: string, id: string) {
  // An item from before Issue-354 has no recruitedIn, which the repository reads as its location.
  const { adventureId: _none, recruitedIn: _since354, ...written } = oldHero(id);
  await db.send(new PutCommand({ TableName: tables.player, Item: { ...playerKeys.hero(p, id), ...written } }));
}

async function putOldCamp(p: string, active: number, living: number) {
  await db.send(new PutCommand({
    TableName: tables.player,
    Item: { ...playerKeys.camp(p, at), location: at, hallLevel: 1, warehouseLevel: 1, activeHeroes: active, livingHeroes: living },
  }));
}

describe("an item from before ElectroDB", () => {
  it("is read only with ignoreOwnership", async () => {
    const p = player();
    const id = randomUUID();
    await putOldHero(p, id);
    expect((await service.entities.hero.get({ playerId: p, id }).go({ consistent: true })).data).toBeNull();
    expect((await service.entities.hero.query.primary({ playerId: p }).go({ consistent: true })).data).toEqual([]);
    const { data } = await service.entities.hero.get({ playerId: p, id }).go({ consistent: true, ignoreOwnership: true });
    expect(data).toMatchObject({ id, name: "Old", status: "ALIVE", retiredAt: null });
    // The composite attribute of the key is not on the item, though the entity's type says it is.
    expect(data).not.toHaveProperty("playerId");
  });

  it("is made whole by a write, which changes nothing else on it", async () => {
    const p = player();
    const id = randomUUID();
    await putOldHero(p, id);
    await putOldCamp(p, 1, 1);
    const before = must(await storedItem(db, tables.player, playerKeys.hero(p, id)), "the old hero");
    const retired = await repo.retire(p, oldHero(id), new Date("2026-11-03T12:00:00.000Z"));
    expect(await storedItem(db, tables.player, playerKeys.hero(p, id))).toEqual({
      ...before, status: "RETIRED", retiredAt: retired.retiredAt, playerId: p, __edb_e__: "hero", __edb_v__: "1",
    });
    expect(await storedItem(db, tables.player, playerKeys.camp(p, at))).toEqual({
      ...playerKeys.camp(p, at), location: at, hallLevel: 1, warehouseLevel: 1, activeHeroes: 0, livingHeroes: 0,
      playerId: p, __edb_e__: "camp", __edb_v__: "1",
    });
    expect((await service.entities.hero.get({ playerId: p, id }).go({ consistent: true })).data).toMatchObject({ id, playerId: p });
  });

  it("is read back as it was once ElectroDB has written it", async () => {
    const p = player();
    const id = randomUUID();
    await putOldHero(p, id);
    await putOldCamp(p, 1, 1);
    await repo.retire(p, oldHero(id), new Date("2026-11-03T12:00:00.000Z"));
    expect(await repo.getHero(p, id)).toEqual({ ...oldHero(id), status: "RETIRED", retiredAt: "2026-11-03T12:00:00.000Z" });
    expect(await repo.camp(p, at)).toMatchObject({ activeHeroes: 0, livingHeroes: 0, stored: true });
  });

  it("defaults through every read what an item written before an attribute existed lacks", async () => {
    const p = player();
    const bare = randomUUID();
    await db.send(new PutCommand({
      TableName: tables.player,
      Item: whole("hero", { ...playerKeys.hero(p, bare), id: bare, location: at, unitType: "villager", spriteSet: "villager-01", name: "Bare", recruitedAt: "2026-10-21T12:00:00.000Z" }),
    }));
    await db.send(new PutCommand({ TableName: tables.player, Item: whole("camp", { ...playerKeys.camp(p, at), location: at }) }));
    expect(await repo.getHero(p, bare)).toEqual({ ...oldHero(bare), name: "Bare" });
    expect((await repo.heroes(p)).map((h) => h.id)).toEqual([bare]);
    expect(await repo.camp(p, at)).toMatchObject({ hallLevel: 1, warehouseLevel: 1, activeHeroes: 0, livingHeroes: 0, stored: true });
  });

  it("is not returned by a read that does not ignore ownership", async () => {
    const p = player();
    const id = randomUUID();
    await putOldHero(p, id);
    await db.send(new PutCommand({ TableName: tables.player, Item: { ...playerKeys.open(p), adventureId: "a", seed: "s", startedAt: "2026-10-21T12:00:00.000Z" } }));
    expect(await repo.getHero(p, id)).toBeUndefined();
    expect(await repo.heroes(p)).toEqual([]);
    expect(await repo.openAdventure(p)).toBeUndefined();
  });

  it("is a sighting still returned until it expires, because `parse` goes by its keys", async () => {
    const location = `l-${randomUUID()}`;
    const now = new Date("2026-11-03T12:00:00.000Z");
    const item = (heroId: string) => ({ ...locationKeys.seen(location, heroId), heroId, location, name: "Seen", unitType: "villager", spriteSet: "villager-01", level: 1, seenAt: now.toISOString(), expiresAt: 4000000000 });
    await db.send(new PutCommand({ TableName: tables.location, Item: item("a0") }));
    await db.send(new PutCommand({ TableName: tables.location, Item: whole("sighting", item("b0")) }));
    await db.send(new PutCommand({ TableName: tables.location, Item: whole("sighting", item("c0")) }));
    const { sightings, read } = await repo.sightings(location, { from: "a" }, 2, now);
    expect(read).toBe(2);
    expect(sightings.map((s) => s.heroId)).toEqual(["a0", "b0"]);
  });

  it("reads a settled adventure back whole, nested fields no entity declares included, and a result from before unlocks and caravans as having earned and delivered none", async () => {
    const adventureId = randomUUID();
    const snapshot = { version: "v", jobId: "sticks", heroes: [{ heroId: "h", name: "Old", stats: { traits: [] }, notDeclared: { deep: [1, null] } }] };
    const result = { outcome: "won", endedAtMs: 12, reachedStage: 0, stages: [{ stage: 0, kind: "battle", ended: "cleared", startedAtMs: 0, endedAtMs: 12 }], rewards: [{ material: "timber", amount: 3 }], credited: [], lost: [], heroes: [] };
    const record = {
      adventureId, playerId: "p", seed: "s", location: at, jobId: "sticks", snapshot, version: "v", startedAt: "2026-10-21T12:00:00.000Z",
      status: "SETTLED", result, settledAt: "2026-10-21T12:01:00.000Z",
    };
    await db.send(new PutCommand({ TableName: tables.location, Item: whole("adventure", { ...locationKeys.adventure(adventureId), ...record }) }));
    expect(await repo.getAdventure(adventureId)).toEqual({ ...record, result: { ...result, unlocks: [], delivered: [], deliveryLost: [] } });
  });

  it("reads a result's unlocks as stored, but for one this deploy's content does not know, which is left out", async () => {
    const known = must(UNLOCK_IDS[0], "an unlock of the content");
    const stored = settledAdventure("sticks", new Date("2026-11-24T12:00:00.000Z"));
    const result = { ...emptyResult("complete"), unlocks: ["an-unlock-of-another-version", known] };
    await db.send(new PutCommand({ TableName: tables.location, Item: whole("adventure", { ...locationKeys.adventure(stored.adventureId), ...stored, result }) }));
    expect((await repo.getAdventure(stored.adventureId))?.result?.unlocks).toEqual([known]);
  });

  it("reads a snapshot from before the gathering traits with each hero's unit type's traits of today, a trait added since among them, and one that has traits as it is (Issue-339, Issue-340)", async () => {
    const adventureId = randomUUID();
    const hero = { heroId: "h", unitType: "villager", name: "Old", spriteSet: "villager-01", level: 1 };
    const wolf = { heroId: "w", unitType: "wolf", name: "Odd", spriteSet: "wolf-01", level: 1 };
    // A ranger of that deploy rated nothing. It is read as skinning, a trait its deploy never had: the page
    // that resumes its run counts hide the issuing deploy does not credit, which the owner accepted for the
    // one release that crosses both changes (the review of PR-346; adventure-loop.md, the item built by Issue-340).
    const ranger = { heroId: "r", unitType: "ranger", name: "Shot", spriteSet: "ranger-01", level: 1, stats: { maxHealth: 26, speed: 10, damage: 6, gather: [] } };
    const own = { heroId: "o", unitType: "villager", name: "New", spriteSet: "villager-01", level: 1, stats: { maxHealth: 30, speed: 8, damage: 4, traits: [{ trait: "mining", level: 3 }] } };
    // As the deploy before wrote them, with the gather ratings of decision 0051, and as the one before that did, with one `gathering` stat.
    const old = { maxHealth: 30, speed: 8, damage: 4, gather: [{ material: "timber", rating: 2 }, { material: "ore", rating: 2 }] };
    const older = { maxHealth: 30, speed: 8, damage: 4, gathering: 4 };
    const record = {
      adventureId, playerId: "p", seed: "s", location: at, jobId: "sticks", version: "v", startedAt: "2026-11-09T12:00:00.000Z", status: "OPEN",
      snapshot: { version: "v", jobId: "sticks", heroes: [{ ...hero, stats: old }, { ...hero, heroId: "g", stats: older }, { ...wolf, stats: old }, ranger, own] },
    };
    await db.send(new PutCommand({ TableName: tables.location, Item: whole("adventure", { ...locationKeys.adventure(adventureId), ...record }) }));
    const { traits } = must(UNIT_PROFILES.villager, "the villager's profile").stats;
    expect(traits).not.toEqual([]);
    expect((await repo.getAdventure(adventureId))?.snapshot.heroes).toEqual([
      { ...hero, stats: { ...old, traits } },
      { ...hero, heroId: "g", stats: { ...older, traits } },
      { ...wolf, stats: { ...old, traits: [] } },
      { ...ranger, stats: { ...ranger.stats, traits: [{ trait: "skinning", level: 1 }] } },
      own,
    ]);
  });

  it("reads a record from before Issue-113, which has no snapshot, as it is", async () => {
    const adventureId = randomUUID();
    const record = { adventureId, playerId: "p", seed: "s", startedAt: "2026-10-01T12:00:00.000Z", status: "OPEN" };
    await db.send(new PutCommand({ TableName: tables.location, Item: whole("adventure", { ...locationKeys.adventure(adventureId), ...record }) }));
    expect(await repo.getAdventure(adventureId)).toEqual(record);
  });

  it("is settled and discarded by conditions that read it as the old code wrote it", async () => {
    const p = player();
    const adventureId = randomUUID();
    await db.send(new PutCommand({ TableName: tables.player, Item: { ...playerKeys.open(p), adventureId, seed: "s", startedAt: "2026-10-21T12:00:00.000Z" } }));
    const record = { adventureId, playerId: p, seed: "s", location: at, jobId: "sticks", snapshot: { version: "v", jobId: "sticks", heroes: [] }, version: "v", startedAt: "2026-10-21T12:00:00.000Z", status: "OPEN" } as const;
    await db.send(new PutCommand({ TableName: tables.location, Item: { ...locationKeys.adventure(adventureId), ...record } }));
    await repo.discard(p, record, new Date("2026-10-21T12:02:00.000Z"));
    expect(await storedItem(db, tables.player, playerKeys.open(p))).toBeUndefined();
    expect(await repo.getAdventure(adventureId)).toEqual({ ...record, status: "DISCARDED", discardedAt: "2026-10-21T12:02:00.000Z" });
    expect(await storedItem(db, tables.location, locationKeys.adventure(adventureId))).toMatchObject({ __edb_e__: "adventure", __edb_v__: "1" });
  });
});

describe("a transaction across the two tables", () => {
  const sighting = (location: string, heroId: string) => ({
    location, heroId, name: "Seen", unitType: "villager", spriteSet: "villager-01", level: 1, seenAt: "2026-11-03T12:00:00.000Z", expiresAt: 4000000000,
  }) as const;

  it("commits to both, each entity on its own table, with no per-commit override", async () => {
    const p = player();
    const heroId = randomUUID();
    const location = `l-${randomUUID()}`;
    const write = service.transaction.write((i) => [
      i.camp.update({ playerId: p, location }).add({ activeHeroes: 1 }).commit(),
      i.sighting.put(sighting(location, heroId)).commit(),
    ]);
    expect(write.params()).toMatchObject({ TransactItems: [{ Update: { TableName: tables.player } }, { Put: { TableName: tables.location } }] });
    const result = await write.go();
    expect(result.canceled).toBe(false);
    expect(await storedItem(db, tables.player, playerKeys.camp(p, location))).toMatchObject({ activeHeroes: 1 });
    expect(await storedItem(db, tables.location, locationKeys.seen(location, heroId))).toMatchObject({ heroId });
  });

  it("writes neither when a condition in the player table fails, and says which item", async () => {
    const p = player();
    const heroId = randomUUID();
    const location = `l-${randomUUID()}`;
    const result = await service.transaction
      .write((i) => [
        i.camp.update({ playerId: p, location }).add({ activeHeroes: 1 }).where((a, op) => op.gt(a.activeHeroes, 5)).commit(),
        i.sighting.put(sighting(location, heroId)).commit(),
      ])
      .go();
    expect(result.canceled).toBe(true);
    expect(result.data.map((item) => [item.rejected, item.code])).toEqual([[true, "ConditionalCheckFailed"], [false, "None"]]);
    expect(await storedItem(db, tables.location, locationKeys.seen(location, heroId))).toBeUndefined();
  });

  it("writes neither when a condition in the location table fails", async () => {
    const p = player();
    const heroId = randomUUID();
    const location = `l-${randomUUID()}`;
    const result = await service.transaction
      .write((i) => [
        i.camp.update({ playerId: p, location }).add({ activeHeroes: 1 }).commit(),
        i.sighting.check({ location, heroId }).where((a, op) => op.exists(a.heroId)).commit(),
      ])
      .go();
    expect(result.data.map((item) => item.code)).toEqual(["None", "ConditionalCheckFailed"]);
    expect(await storedItem(db, tables.player, playerKeys.camp(p, location))).toBeUndefined();
  });

  it("also takes the maintainer's per-commit table, which this shape does not need", () => {
    const one = createService(db, { player: tables.player, location: tables.player });
    const params = one.transaction
      .write((i) => [i.sighting.delete({ location: at, heroId: "h" }).commit({ table: tables.location })])
      .params();
    expect(params).toMatchObject({ TransactItems: [{ Delete: { TableName: tables.location } }] });
  });
});

/**
 * What decision 0059 left for Issue-351 to check: how ElectroDB writes an item
 * only if it is absent, inside a transaction, without cancelling the
 * transaction when the item exists. An update whose every attribute is set
 * with `ifNotExists`, and no condition.
 */
describe("an unlock written only if it is absent", () => {
  const unlock = must(UNLOCK_IDS[0], "an unlock of the content");
  const first = { earnedAt: "2026-11-24T12:00:00.000Z", adventureId: "the-first-adventure" };
  const second = { earnedAt: "2026-11-25T12:00:00.000Z", adventureId: "the-second-adventure" };

  /** The write settlement makes for an unlock, beside another write of the same transaction. */
  const grant = (p: string, location: string, { earnedAt, adventureId }: typeof first) =>
    service.transaction.write((i) => [
      i.unlock
        .update({ playerId: p, unlock })
        .data((a, op) => {
          op.ifNotExists(a.earnedAt, earnedAt);
          op.ifNotExists(a.adventureId, adventureId);
        })
        .commit(),
      i.camp.update({ playerId: p, location }).add({ activeHeroes: 1 }).commit(),
    ]);

  it("is an Update with no condition, whose attributes are set by if_not_exists", () => {
    const [item] = (grant(player(), at, first).params() as { TransactItems: { Update: { UpdateExpression: string; ConditionExpression?: string } }[] }).TransactItems;
    expect(item?.Update).not.toHaveProperty("ConditionExpression");
    expect(item?.Update.UpdateExpression).toContain("#earnedAt = if_not_exists(#earnedAt, ");
    expect(item?.Update.UpdateExpression).toContain("#adventureId = if_not_exists(#adventureId, ");
  });

  it("makes the item when the player holds none, whole enough for ElectroDB to read it back", async () => {
    const p = player();
    const location = `l-${randomUUID()}`;
    expect((await grant(p, location, first).go()).canceled).toBe(false);
    expect(await storedItem(db, tables.player, playerKeys.unlock(p, unlock))).toEqual({
      ...playerKeys.unlock(p, unlock), playerId: p, unlock, ...first, __edb_e__: "unlock", __edb_v__: "1",
    });
    expect((await service.entities.unlock.get({ playerId: p, unlock }).go({ consistent: true })).data).toEqual({ playerId: p, unlock, ...first });
  });

  it("changes nothing on an item the player holds and cancels nothing: the rest of the transaction commits", async () => {
    const p = player();
    const location = `l-${randomUUID()}`;
    await grant(p, location, first).go();
    const held = await storedItem(db, tables.player, playerKeys.unlock(p, unlock));
    const again = await grant(p, location, second).go();
    expect(again.canceled).toBe(false);
    expect(await storedItem(db, tables.player, playerKeys.unlock(p, unlock))).toEqual(held);
    expect(await storedItem(db, tables.player, playerKeys.camp(p, location))).toMatchObject({ activeHeroes: 2 });
  });

  it("is what a condition check on the unlock's item passes on, and fails on without it", async () => {
    const p = player();
    const location = `l-${randomUUID()}`;
    const checked = () =>
      service.transaction
        .write((i) => [
          i.unlock.check({ playerId: p, unlock }).where((a, op) => op.exists(a.earnedAt)).commit(),
          i.camp.update({ playerId: p, location }).add({ activeHeroes: 1 }).commit(),
        ])
        .go();
    expect((await checked()).data.map((item) => item.code)).toEqual(["ConditionalCheckFailed", "None"]);
    await grant(p, `l-${randomUUID()}`, first).go();
    expect((await checked()).canceled).toBe(false);
    expect(await storedItem(db, tables.player, playerKeys.camp(p, location))).toMatchObject({ activeHeroes: 1 });
  });

  it("is read with every unlock of the player in one Query, and one the content does not know is left out", async () => {
    const p = player();
    await grant(p, `l-${randomUUID()}`, first).go();
    // As the deploy after this one may write it, for an unlock its content has and this one's has not.
    const unknown = "an-unlock-of-another-version";
    await db.send(new PutCommand({ TableName: tables.player, Item: whole("unlock", { ...playerKeys.unlock(p, unknown), playerId: p, unlock: unknown, ...second }) }));
    expect(service.entities.unlock.query.primary({ playerId: p }).params({ consistent: true })).toMatchObject({
      KeyConditionExpression: "#pk = :pk and begins_with(#sk1, :sk1)",
      ExpressionAttributeValues: { ":sk1": "UNLOCK#" },
    });
    expect(await repo.unlocks(p)).toEqual([{ unlock, ...first }]);
    expect(await repo.unlocks(player())).toEqual([]);
  });
});

describe("a transaction DynamoDB cancels", () => {
  /** A repository whose every transaction is cancelled with these reasons, which ElectroDB reads as it would DynamoDB's. */
  function cancelledWith(reasons: CancellationReason[]): Repository {
    const client = createDocumentClient(configFromEnv());
    client.middlewareStack.add(
      () => () => Promise.reject(new TransactionCanceledException({ message: "cancelled", $metadata: {}, CancellationReasons: reasons })),
      { step: "initialize" },
    );
    return new Repository(client, tables);
  }

  it("maps an item's TransactionConflict to the error the caller retries, whichever item it is", async () => {
    const reasons = [{ Code: "None" }, { Code: "TransactionConflict", Message: "another is committing" }, { Code: "None" }];
    await expect(cancelledWith(reasons).retire(player(), oldHero(randomUUID()))).rejects.toBeInstanceOf(TransactionConflict);
  });

  it("takes a conflict before a failed condition, which a read made at once may not explain", async () => {
    const reasons = [{ Code: "ConditionalCheckFailed" }, { Code: "TransactionConflict" }, { Code: "None" }];
    await expect(cancelledWith(reasons).retire(player(), oldHero(randomUUID()))).rejects.toBeInstanceOf(TransactionConflict);
  });

  it("maps a failed condition to the typed error of that item", async () => {
    const reasons = [{ Code: "None" }, { Code: "ConditionalCheckFailed" }, { Code: "None" }];
    await expect(cancelledWith(reasons).retire(player(), oldHero(randomUUID()))).rejects.toBeInstanceOf(HeroChanged);
  });

  it("says what DynamoDB said of a cancellation no rule explains", async () => {
    const reasons = [{ Code: "None" }, { Code: "ValidationError", Message: "an expression is malformed" }, { Code: "None" }];
    await expect(cancelledWith(reasons).retire(player(), oldHero(randomUUID()))).rejects.toThrow("ValidationError: an expression is malformed");
  });
});

describe("the reads of decision 0041", () => {
  it("reads strongly by the option, as graphql.md rule 9 asks", () => {
    const p = player();
    expect(service.entities.hero.get({ playerId: p, id: "h" }).params({ consistent: true })).toMatchObject({ ConsistentRead: true });
    expect(service.entities.hero.query.primary({ playerId: p }).params({ consistent: true })).toMatchObject({ ConsistentRead: true });
  });

  it("cannot read the camps by prefix through a collection: it reads the whole partition", () => {
    // A key template has no collection prefix to query by, so the collection's
    // only key condition is the partition, heroes and ledger with it.
    const attributes = { playerId: { type: "string", required: true }, location: { type: "string", required: true } } as const;
    const pk = { field: "PK", composite: ["playerId"], template: "PLAYER#${playerId}", casing: "none" } as const;
    const camp = new Entity(
      {
        model: { entity: "camp", service: "heat", version: "1" },
        attributes,
        indexes: { primary: { type: "clustered", collection: "camp", pk, sk: { field: "SK", composite: ["location"], template: "AT#${location}#CAMP", casing: "none" } } },
      },
      { client: db, table: tables.player },
    );
    const holding = new Entity(
      {
        model: { entity: "holding", service: "heat", version: "1" },
        attributes: { ...attributes, material: { type: "string", required: true } },
        indexes: { primary: { type: "clustered", collection: "camp", pk, sk: { field: "SK", composite: ["location", "material"], template: "AT#${location}#HOLDING#${material}", casing: "none" } } },
      },
      { client: db, table: tables.player },
    );
    const collections = new Service({ camp, holding }, { client: db, table: tables.player }).collections;
    expect(collections.camp({ playerId: "p" }).params({ consistent: true })).toMatchObject({ KeyConditionExpression: "#pk = :pk" });
  });

  it("reads the camps by prefix in one Query, and each entity parses its own items out of it", async () => {
    const p = player();
    const id = randomUUID();
    await putOldHero(p, id);
    await putOldCamp(p, 1, 1);
    await db.send(new PutCommand({ TableName: tables.player, Item: { ...playerKeys.holding(p, at, "timber"), material: "timber", balance: 5 } }));
    await db.send(new PutCommand({ TableName: tables.player, Item: { ...playerKeys.facility(p, at, "job-board"), location: at, kind: "job-board", level: 1 } }));
    const { camp, holding } = service.entities;

    const query = camp.query.primary({ playerId: p });
    expect(query.params({ consistent: true, ignoreOwnership: true })).toMatchObject({
      KeyConditionExpression: "#pk = :pk and begins_with(#sk1, :sk1)",
      ExpressionAttributeValues: { ":sk1": "AT#" },
    });
    const { data } = await query.go({ consistent: true, pages: "all", ignoreOwnership: true, data: "raw" });
    const items = (data as unknown as { Items: Record<string, unknown>[]; ScannedCount: number }).Items;
    expect(items).toHaveLength(3);
    expect(camp.parse({ Items: items }, { ignoreOwnership: true }).data).toMatchObject([{ location: at, activeHeroes: 1 }]);
    expect(holding.parse({ Items: items }, { ignoreOwnership: true }).data).toMatchObject([{ material: "timber", balance: 5 }]);
  });

  it("reads the camps past a page, which a raw read does not do by itself", async () => {
    const p = player();
    const locations = ["a", "b", "c", "d"];
    await putOldCampsPastAPage(db, tables.player, p, locations);
    // `pages` has no effect on a raw read, which is why the repository pages by hand (decision 0042).
    const first = await service.entities.camp.query.primary({ playerId: p }).go({ consistent: true, pages: "all", ignoreOwnership: true, data: "raw" });
    expect(first.data).toHaveProperty("LastEvaluatedKey");
    // `camps` answers the locations the player has unlocked, which these are not, so each is read by `camp`.
    for (const location of locations) expect((await repo.camp(p, location)).stored, location).toBe(true);
  });

  it("reads a sightings window as the repository does, with the limit before the filter", async () => {
    const location = `l-${randomUUID()}`;
    const now = new Date("2026-11-03T12:00:00.000Z");
    const seconds = Math.floor(now.getTime() / 1000);
    const expiries: [string, number][] = [["a0", seconds - 1], ["b0", seconds + 1], ["c0", seconds - 1], ["d0", seconds + 1], ["e0", seconds + 1]];
    for (const [heroId, expiresAt] of expiries) {
      await db.send(new PutCommand({
        TableName: tables.location,
        Item: { ...locationKeys.seen(location, heroId), heroId, location, name: "Seen", unitType: "villager", spriteSet: "villager-01", level: 1, seenAt: now.toISOString(), expiresAt },
      }));
    }
    // A hero id is hex, so `g` stands above every one.
    const from = service.entities.sighting.query.primary({ location }).between({ heroId: "a" }, { heroId: "g" }).where((a, op) => op.gt(a.expiresAt, seconds));
    const read = await repo.sightings(location, { from: "a" }, 3, now);
    expect(read.read).toBe(3);
    expect(read.sightings.map((s) => s.heroId)).toEqual(["b0"]);

    // `limit` is DynamoDB's Limit; the identifiers' filter is off, and `go` keeps no ScannedCount, so the count needs `raw`.
    expect(from.params({ limit: 3, ignoreOwnership: true })).toMatchObject({ Limit: 3, FilterExpression: "#expiresAt > :expiresAt0" });
    const limited = await from.go({ limit: 3, ignoreOwnership: true });
    expect(limited.data.map((s) => s.heroId)).toEqual(read.sightings.map((s) => s.heroId));
    const rawRead = await from.go({ limit: 3, ignoreOwnership: true, data: "raw" });
    expect((rawRead.data as unknown as { ScannedCount: number }).ScannedCount).toBe(read.read);

    // `count` goes on reading until it has that many, which is not the bound decision 0029 needs.
    const counted = await from.go({ count: 3, ignoreOwnership: true });
    expect(counted.data.map((s) => s.heroId)).toEqual(["b0", "d0", "e0"]);

    const before = await service.entities.sighting.query.primary({ location }).between({ heroId: "" }, { heroId: "b0" }).go({ limit: 5, ignoreOwnership: true });
    expect(before.data.map((s) => s.heroId)).toEqual((await repo.sightings(location, { before: "b0" }, 5, new Date(0))).sightings.map((s) => s.heroId));
  });
});
