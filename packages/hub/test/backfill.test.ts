import { randomUUID } from "node:crypto";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteCommand, type DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { beforeAll, describe, expect, it } from "vitest";

import { backfill, makeWhole } from "../src/db/backfill.js";
import { configFromEnv, createDocumentClient, type Tables } from "../src/db/client.js";
import { createService, type HeatService } from "../src/db/entities.js";
import { player, storedItem } from "./data.js";
import { locationKeys, playerKeys } from "./keys.js";
import { ensureTable } from "./setup/table.js";

/**
 * The backfill of decision 0041, over whole tables of its own: every other test
 * file writes items without identifiers into the shared ones.
 */

let db: DynamoDBDocumentClient;
let tables: Tables;
let service: HeatService;

const at = "millbrook";

beforeAll(async () => {
  const config = configFromEnv();
  db = createDocumentClient(config);
  tables = { player: `backfill-player-${randomUUID()}`, location: `backfill-location-${randomUUID()}` };
  service = createService(db, tables);
  const client = new DynamoDBClient({ region: "us-east-1", endpoint: config.endpoint ?? "" });
  await ensureTable(client, tables.player);
  await ensureTable(client, tables.location);
});

const putPlayerItem = (item: Record<string, unknown>) => db.send(new PutCommand({ TableName: tables.player, Item: item }));
const putLocationItem = (item: Record<string, unknown>) => db.send(new PutCommand({ TableName: tables.location, Item: item }));

describe("the backfill", () => {
  it("makes all eight item types whole, once, over both tables, leaving what no entity owns", async () => {
    const p = player();
    const heroId = randomUUID();
    const adventureId = randomUUID();
    const seen = locationKeys.seen(at, heroId);
    const spike = { PK: `PLAYER#${p}`, SK: "HOLDING#timber" };
    await putPlayerItem({ ...playerKeys.profile(p), id: p, name: "Old" });
    await putPlayerItem({ ...playerKeys.camp(p, at), location: at, hallLevel: 2, warehouseLevel: 1, activeHeroes: 1, livingHeroes: 1 });
    await putPlayerItem({ ...playerKeys.facility(p, at, "mine"), location: at, kind: "mine", level: 1 });
    await putPlayerItem({ ...playerKeys.holding(p, at, "timber"), material: "timber", balance: 5 });
    await putPlayerItem({ ...playerKeys.hero(p, heroId), id: heroId, location: at, unitType: "villager", spriteSet: "villager-01", name: "Old", recruitedAt: "2026-10-21T12:00:00.000Z" });
    await putPlayerItem({ ...playerKeys.open(p), adventureId, seed: "s", startedAt: "2026-10-21T12:00:00.000Z" });
    await putPlayerItem({ ...playerKeys.ledger(p, heroId, "debit#timber"), location: at, material: "timber", delta: -5 });
    await putPlayerItem({ ...spike, material: "timber", balance: 9 });
    await putLocationItem({ ...locationKeys.adventure(adventureId), adventureId, playerId: p, seed: "s", status: "OPEN", startedAt: "2026-10-21T12:00:00.000Z" });
    await putLocationItem({ ...seen, heroId, location: at, name: "Old", unitType: "villager", spriteSet: "villager-01", level: 1, seenAt: "2026-10-21T12:00:00.000Z", expiresAt: 4000000000 });

    expect(await backfill(db, tables)).toEqual({ written: 8, remaining: 0, leftAside: 2 });
    expect(await backfill(db, tables)).toEqual({ written: 0, remaining: 0, leftAside: 2 });

    const { adventure, camp, facility, hero, holding, ledger, open, profile } = service.entities;
    const strong = { consistent: true } as const;
    expect((await profile.get({ id: p }).go(strong)).data).toMatchObject({ id: p, name: "Old" });
    expect((await camp.get({ playerId: p, location: at }).go(strong)).data).toMatchObject({ playerId: p, location: at, hallLevel: 2 });
    expect((await facility.get({ playerId: p, location: at, kind: "mine" }).go(strong)).data).toMatchObject({ playerId: p, level: 1 });
    expect((await holding.get({ playerId: p, location: at, material: "timber" }).go(strong)).data).toMatchObject({ location: at, balance: 5 });
    expect((await hero.get({ playerId: p, id: heroId }).go(strong)).data).toMatchObject({ id: heroId, playerId: p });
    expect((await open.get({ playerId: p }).go(strong)).data).toMatchObject({ playerId: p, adventureId });
    expect((await ledger.get({ playerId: p, cause: heroId, entry: "debit#timber" }).go(strong)).data).toMatchObject({ cause: heroId, delta: -5 });
    expect((await adventure.get({ adventureId }).go(strong)).data).toMatchObject({ adventureId, status: "OPEN" });
    expect(await storedItem(db, tables.player, spike)).toEqual({ ...spike, material: "timber", balance: 9 });
    expect(await storedItem(db, tables.location, seen)).not.toHaveProperty("__edb_e__");
  });

  it("does not write back an item deleted since the scan", async () => {
    const key = playerKeys.open(player());
    await putPlayerItem({ ...key, adventureId: "a", seed: "s", startedAt: "2026-10-21T12:00:00.000Z" });
    await db.send(new DeleteCommand({ TableName: tables.player, Key: key }));
    expect(await makeWhole(db, tables.player, key)).toBe(false);
    expect(await storedItem(db, tables.player, key)).toBeUndefined();
  });

  it("leaves a whole item as it is", async () => {
    const p = player();
    await service.entities.profile.put({ id: p, name: "New" }).go();
    expect(await makeWhole(db, tables.player, playerKeys.profile(p))).toBe(false);
  });

  it("reads past a page of the scan, and counts an item it does not know as remaining", async () => {
    const p = player();
    const padding = "x".repeat(350_000);
    for (const location of ["a", "b", "c", "d"]) {
      await putPlayerItem({ ...playerKeys.camp(p, location), location, hallLevel: 1, padding });
    }
    await putPlayerItem({ PK: `PLAYER#${p}`, SK: "UNKNOWN#item" });
    expect(await backfill(db, tables)).toEqual({ written: 4, remaining: 1, leftAside: 2 });
    await db.send(new DeleteCommand({ TableName: tables.player, Key: { PK: `PLAYER#${p}`, SK: "UNKNOWN#item" } }));
  });
});
