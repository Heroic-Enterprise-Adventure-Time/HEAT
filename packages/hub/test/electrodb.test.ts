import { randomUUID } from "node:crypto";

import { type CancellationReason, TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { type DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { Entity, Service } from "electrodb";
import { beforeAll, describe, expect, it } from "vitest";

import { must } from "@heat/engine";

import { configFromEnv, createDocumentClient, type Tables } from "../src/db/client.js";
import { createService, type HeatService } from "../src/db/entities.js";
import { locationKeys, playerKeys } from "../src/db/keys.js";
import { type Hero, HeroChanged, Repository, TransactionConflict } from "../src/db/repository.js";
import { player, storedItem } from "./data.js";

/**
 * What decision 0041 rests on, against DynamoDB Local: how ElectroDB meets
 * items the hand-written repository wrote, the transaction across the two
 * tables, and the reads Issue-201 moves. The items here are written as that
 * code wrote them, without identifiers or the keys' composite attributes.
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

const oldHero = (id: string): Hero => ({
  id, location: at, unitType: "villager", spriteSet: "villager-01", name: "Old", recruitedAt: "2026-10-21T12:00:00.000Z",
  level: 1, xp: 0, picks: [], status: "ALIVE", retiredAt: null, adventureId: null,
});

async function putOldHero(p: string, id: string) {
  const { adventureId: _none, ...written } = oldHero(id);
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

  it("is read by the old mappers once ElectroDB has written it, so the previous route still works", async () => {
    const p = player();
    const id = randomUUID();
    await putOldHero(p, id);
    await putOldCamp(p, 1, 1);
    await repo.retire(p, oldHero(id), new Date("2026-11-03T12:00:00.000Z"));
    expect(await repo.getHero(p, id)).toEqual({ ...oldHero(id), status: "RETIRED", retiredAt: "2026-11-03T12:00:00.000Z" });
    expect(await repo.camp(p, at)).toMatchObject({ activeHeroes: 0, livingHeroes: 0, stored: true });
  });

  it("is made whole by the backfill of decision 0041, once, leaving what no entity owns", async () => {
    const p = player();
    const id = randomUUID();
    await putOldHero(p, id);
    await putOldCamp(p, 1, 1);
    await db.send(new PutCommand({ TableName: tables.player, Item: { ...playerKeys.holding(p, at, "timber"), material: "timber", balance: 5 } }));
    await db.send(new PutCommand({ TableName: tables.player, Item: { ...playerKeys.ledger(p, id, "debit#timber"), location: at, material: "timber", delta: -5 } }));
    // The spike's holding, no longer read (decision 0026), which no entity's key matches.
    const spike = { PK: `PLAYER#${p}`, SK: "HOLDING#timber" };
    await db.send(new PutCommand({ TableName: tables.player, Item: { ...spike, material: "timber", balance: 9 } }));

    const backfilled = await backfill(`PLAYER#${p}`);
    expect(backfilled).toBe(4);
    expect(await backfill(`PLAYER#${p}`)).toBe(0);

    const { hero, camp, holding, ledger } = service.entities;
    expect((await hero.get({ playerId: p, id }).go({ consistent: true })).data).toMatchObject({ id, playerId: p });
    expect((await camp.get({ playerId: p, location: at }).go({ consistent: true })).data).toMatchObject({ playerId: p, activeHeroes: 1 });
    expect((await holding.get({ playerId: p, location: at, material: "timber" }).go({ consistent: true })).data).toMatchObject({ location: at, balance: 5 });
    expect((await ledger.get({ playerId: p, cause: id, entry: "debit#timber" }).go({ consistent: true })).data).toMatchObject({ cause: id, delta: -5 });
    expect(await storedItem(db, tables.player, spike)).toEqual({ ...spike, material: "timber", balance: 9 });
  });
});

/**
 * The plan's shape for the item types with an entity today, over one player's
 * partition: the sort key says the entity and its composites. Issue-201 runs it
 * over each table with a `Scan` that pages, and with its other entities.
 */
async function backfill(pk: string): Promise<number> {
  const found = await db.send(new QueryCommand({
    TableName: tables.player,
    KeyConditionExpression: "PK = :pk",
    FilterExpression: "attribute_not_exists(#e)",
    ExpressionAttributeNames: { "#e": "__edb_e__" },
    ExpressionAttributeValues: { ":pk": pk },
    ConsistentRead: true,
  }));
  let written = 0;
  for (const item of found.Items ?? []) {
    const sk = item["SK"] as string;
    const parts = sk.split("#");
    const composites = entityOf(sk, parts);
    if (!composites) continue;
    const attributes = { playerId: pk.slice("PLAYER#".length), ...composites.attributes };
    const names = Object.keys(attributes);
    await db.send(new UpdateCommand({
      TableName: tables.player,
      Key: { PK: pk, SK: sk },
      UpdateExpression: `SET #e = :e, #v = :v, ${names.map((_, n) => `#a${n} = :a${n}`).join(", ")}`,
      ConditionExpression: "attribute_not_exists(#e)",
      ExpressionAttributeNames: { "#e": "__edb_e__", "#v": "__edb_v__", ...Object.fromEntries(names.map((name, n) => [`#a${n}`, name])) },
      ExpressionAttributeValues: { ":e": composites.entity, ":v": "1", ...Object.fromEntries(Object.values(attributes).map((value, n) => [`:a${n}`, value])) },
    }));
    written++;
  }
  return written;
}

function entityOf(sk: string, [kind = "", first = "", second = "", third = ""]: string[]): { entity: string; attributes: Record<string, string> } | undefined {
  if (kind === "HERO") return { entity: "hero", attributes: { id: first } };
  if (kind === "LEDGER") return { entity: "ledger", attributes: { cause: first, entry: sk.slice(`LEDGER#${first}#`.length) } };
  if (kind === "AT" && second === "CAMP") return { entity: "camp", attributes: { location: first } };
  if (kind === "AT" && second === "HOLDING") return { entity: "holding", attributes: { location: first, material: third } };
  return undefined;
}

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

describe("the reads Issue-201 moves", () => {
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
    // A hero id is hex, so `g` stands above every one, where the repository writes `SEEN$`.
    const from = service.entities.sighting.query.primary({ location }).between({ heroId: "a" }, { heroId: "g" }).where((a, op) => op.gt(a.expiresAt, seconds));
    const hand = await repo.sightings(location, { from: "a" }, 3, now);
    expect(hand.read).toBe(3);

    // `limit` is DynamoDB's Limit; the identifiers' filter is off, and `go` keeps no ScannedCount, so the count needs `raw`.
    expect(from.params({ limit: 3, ignoreOwnership: true })).toMatchObject({ Limit: 3, FilterExpression: "#expiresAt > :expiresAt0" });
    const limited = await from.go({ limit: 3, ignoreOwnership: true });
    expect(limited.data.map((s) => s.heroId)).toEqual(hand.sightings.map((s) => s.heroId));
    const rawRead = await from.go({ limit: 3, ignoreOwnership: true, data: "raw" });
    expect((rawRead.data as unknown as { ScannedCount: number }).ScannedCount).toBe(hand.read);

    // `count` goes on reading until it has that many, which is not the bound decision 0029 needs.
    const counted = await from.go({ count: 3, ignoreOwnership: true });
    expect(counted.data.map((s) => s.heroId)).toEqual(["b0", "d0", "e0"]);

    const before = await service.entities.sighting.query.primary({ location }).between({ heroId: "" }, { heroId: "b0" }).go({ limit: 5, ignoreOwnership: true });
    expect(before.data.map((s) => s.heroId)).toEqual((await repo.sightings(location, { before: "b0" }, 5, new Date(0))).sightings.map((s) => s.heroId));
  });
});
