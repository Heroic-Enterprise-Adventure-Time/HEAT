import { randomUUID } from "node:crypto";

import { type DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { range } from "es-toolkit";
import { vi } from "vitest";

import { type AdventureOutcome, FACILITIES, type FacilityKind, type Material, must, STARTING_LOCATION, type UnitType, type UnlockId } from "@heat/engine";

import { buildFacility } from "../src/build.js";
import { configFromEnv, createDocumentClient, type Tables } from "../src/db/client.js";
import { ITEM_VERSION } from "../src/db/keys.js";
import { type AdventureRecord, type Hero, type HeroStatus, Repository, type SettledResult } from "../src/db/repository.js";
import { RECENT_TTL_SECONDS, type RecentAdventure } from "../src/recent.js";
import { recruitHero } from "../src/recruit.js";
import { startAdventure } from "../src/start.js";
import { locationKeys, playerKeys, replayKeys } from "./keys.js";
import { VERSION } from "./versions.js";

/**
 * What the data-layer tests share for their data (typescript.md, rule 19):
 * the tables as a test reaches them, a player no other test has, and an item
 * as it is stored, read past the repository.
 */

/** The client, the tables' names and a repository on them, from the environment the global set-up made: what a file's `beforeAll` asks for. */
export function connected(): { db: DynamoDBDocumentClient; tables: Tables; repo: Repository } {
  const config = configFromEnv();
  const db = createDocumentClient(config);
  return { db, tables: config.tables, repo: new Repository(db, config.tables) };
}

export const player = () => `p-${randomUUID()}`;

/** A location no content knows and no other test has, so that no other test's sightings or adventures are read at it. */
export const place = () => `test-${randomUUID()}`;

/** The time a number of minutes before another. */
export const minutesBefore = (now: Date, minutes: number) => new Date(now.getTime() - minutes * 60_000);

export const ids = (heroes: readonly Hero[]) => heroes.map((h) => h.id);

/** An item a test puts past the repository, with what ElectroDB finds it by. */
export const whole = <Item extends object>(entity: string, item: Item) => ({ ...item, __edb_e__: entity, __edb_v__: ITEM_VERSION });

export async function storedItem(db: DynamoDBDocumentClient, table: string, key: { PK: string; SK: string }) {
  return (await db.send(new GetCommand({ TableName: table, Key: key, ConsistentRead: true }))).Item;
}

/** A feed item as settlement writes it (decision 0050), settled at the given time: a lone villager home from the wolves, unless overridden. */
export function recentAdventure(location: string, at: Date, overrides: Partial<RecentAdventure> = {}): RecentAdventure {
  return {
    adventureId: randomUUID(),
    location,
    jobId: "wolves-on-the-mill-road",
    outcome: "complete",
    stages: [{ stage: 0, kind: "travel", ended: "done", startedAtMs: 0, endedAtMs: 1000 }],
    credited: [{ material: "cloth", amount: 10 }],
    party: [{ name: "Ada", unitType: "villager", spriteSet: "villager-01", level: 2, died: false }],
    settledAt: at.toISOString(),
    expiresAt: Math.floor(at.getTime() / 1000) + RECENT_TTL_SECONDS,
    ...overrides,
  };
}

/** Puts a feed item past the repository, under the key the layout gives it. */
export async function putRecentAdventure(db: DynamoDBDocumentClient, table: string, item: RecentAdventure): Promise<RecentAdventure> {
  await db.send(new PutCommand({ TableName: table, Item: whole("recent", { ...locationKeys.done(item.location, item.settledAt, item.adventureId), ...item }) }));
  return item;
}

/** Puts stock into a player's camp at a location directly, as a settlement would credit it or a caravan deliver it. */
export async function stock(repo: Repository, p: string, location: string, holdings: Partial<Record<Material, number>>): Promise<void> {
  for (const [material, balance] of Object.entries(holdings) as [Material, number][]) await repo.setBalance(p, location, material, balance);
}

/**
 * A facility built up to a level as a player builds it, through the verb:
 * each level it lacks paid for with what that level costs, after whatever the
 * level needs first is built the same way, as the caravan hub needs a level-2
 * warehouse. It leaves the camp's stock at whatever the last build left.
 */
export async function build(repo: Repository, p: string, location: string, kind: FacilityKind, level = 1): Promise<void> {
  const camp = await repo.camp(p, location);
  const built = kind === "heroes-hall" ? camp.hallLevel : kind === "warehouse" ? camp.warehouseLevel : (camp.facilities[kind] ?? 0);
  for (const next of range(built + 1, level + 1)) {
    const step = must(FACILITIES[kind].levels[next - 1], `level ${next} of the ${kind}`);
    for (const need of step.requires) await build(repo, p, location, need.kind, need.level);
    for (const { material, amount } of step.cost) await repo.setBalance(p, location, material, amount);
    await buildFacility(repo, p, location, kind, next);
  }
}

/** A camp's balances by material, as the repository reads them. */
export async function balances(repo: Repository, p: string, location: string): Promise<Record<string, number>> {
  return Object.fromEntries((await repo.holdings(p, location)).map((h) => [h.material, h.balance]));
}

/**
 * A living villager recruited at a location just now, on no adventure: the
 * hero the tests start from, with what a test means changed by `overrides`
 * (typescript.md, rule 19), so that a new attribute of a hero is added here
 * once.
 */
export function heroFixture(location: string, overrides: Partial<Hero> = {}): Hero {
  return {
    id: randomUUID(),
    location,
    recruitedIn: location,
    unitType: "villager",
    spriteSet: "villager-01",
    name: "Wren",
    recruitedAt: new Date().toISOString(),
    level: 1,
    xp: 0,
    picks: [],
    status: "ALIVE",
    retiredAt: null,
    adventureId: null,
    ...overrides,
  };
}

/** A level-1 camp at a location with the given counts, put past the repository, as the transactions that recruit, kill and retire heroes leave one. */
export async function putCamp(db: DynamoDBDocumentClient, tables: Tables, p: string, location: string, activeHeroes: number, livingHeroes: number): Promise<void> {
  await db.send(new PutCommand({
    TableName: tables.player,
    Item: whole("camp", { ...playerKeys.camp(p, location), location, hallLevel: 1, warehouseLevel: 1, activeHeroes, livingHeroes }),
  }));
}

/** Villagers of the given statuses at a location, and a camp there whose counts agree with them. */
export async function putHeroes(db: DynamoDBDocumentClient, tables: Tables, p: string, statuses: readonly HeroStatus[], location: string): Promise<Hero[]> {
  const heroes = statuses.map((status, i) => heroFixture(location, { name: `Hero ${i}`, status }));
  for (const hero of heroes) {
    await db.send(new PutCommand({ TableName: tables.player, Item: whole("hero", { ...playerKeys.hero(p, hero.id), ...hero }) }));
  }
  await putCamp(db, tables, p, location, statuses.filter((s) => s !== "RETIRED").length, statuses.filter((s) => s === "ALIVE").length);
  return heroes;
}

/** A player's adventure on a job of the starting location, open, with the free villager, issued by the given version. */
export async function opened(repo: Repository, p: string, version: string, jobId: string): Promise<AdventureRecord> {
  const villager = await recruitHero(repo, p, STARTING_LOCATION, "villager", randomUUID());
  return startAdventure(repo, p, version, randomUUID(), STARTING_LOCATION, jobId, [villager.id]);
}

/** Living heroes of the given unit types at a location, with their sightings, and a level-1 camp there that counts them. */
export async function putParty(db: DynamoDBDocumentClient, tables: Tables, p: string, unitTypes: readonly UnitType[], location: string): Promise<Hero[]> {
  const heroes = unitTypes.map((unitType, i) => heroFixture(location, { unitType, spriteSet: `${unitType}-01`, name: `Hero ${i}` }));
  for (const hero of heroes) {
    await db.send(new PutCommand({ TableName: tables.player, Item: whole("hero", { ...playerKeys.hero(p, hero.id), ...hero }) }));
    await db.send(new PutCommand({
      TableName: tables.location,
      Item: whole("sighting", { ...locationKeys.seen(location, hero.id), heroId: hero.id, level: 1, seenAt: "2026-01-01T00:00:00.000Z", expiresAt: 1 }),
    }));
  }
  await putCamp(db, tables, p, location, heroes.length, heroes.length);
  return heroes;
}

/** A result of the given outcome with nothing else in it. */
export const emptyResult = (outcome: AdventureOutcome): SettledResult => ({ outcome, endedAtMs: 1000, reachedStage: 0, stages: [], rewards: [], credited: [], lost: [], heroes: [], unlocks: [], delivered: [], deliveryLost: [] });

/** Puts an unlock past the repository, as settlement leaves one the player earned, so that a test starts with a location unlocked. */
export async function putUnlock(db: DynamoDBDocumentClient, table: string, p: string, unlock: UnlockId, earned: { earnedAt: string; adventureId: string } = { earnedAt: "2026-11-24T12:00:00.000Z", adventureId: randomUUID() }) {
  await db.send(new PutCommand({ TableName: table, Item: whole("unlock", { ...playerKeys.unlock(p, unlock), playerId: p, unlock, ...earned }) }));
  return { unlock, ...earned };
}

/** A settled record of the job as settlement leaves it, settled at the given time: nobody's party home with nothing, unless overridden. */
export function settledAdventure(jobId: string, at: Date, overrides: Partial<AdventureRecord> = {}): AdventureRecord {
  return {
    adventureId: randomUUID(),
    playerId: player(),
    seed: randomUUID(),
    location: "millbrook",
    jobId,
    snapshot: { version: VERSION, jobId, heroes: [] },
    version: VERSION,
    startedAt: new Date(at.getTime() - 60_000).toISOString(),
    status: "SETTLED",
    result: emptyResult("complete"),
    settledAt: at.toISOString(),
    ...overrides,
  };
}

/** Puts a settled record past the repository, under its key and the index's keys the layout gives it. */
export async function putSettledAdventure(db: DynamoDBDocumentClient, table: string, record: AdventureRecord): Promise<AdventureRecord> {
  const settledAt = must(record.settledAt, "the time the record settled");
  await db.send(new PutCommand({ TableName: table, Item: whole("adventure", { ...locationKeys.adventure(record.adventureId), ...replayKeys(record.jobId, settledAt), replayOf: record.jobId, ...record }) }));
  return record;
}

/** Items a table's Queries read during `run`, and how many Queries there were; the caller restores the spy. */
export async function reads<T>(db: DynamoDBDocumentClient, table: string, run: () => Promise<T>): Promise<{ result: T; queries: number; read: number }> {
  const send = vi.spyOn(db, "send");
  const result = await run();
  let queries = 0;
  let read = 0;
  for (const [i, [command]] of send.mock.calls.entries()) {
    if (!(command instanceof QueryCommand) || command.input.TableName !== table) continue;
    queries++;
    read += ((await must(send.mock.results[i], `the result of call ${i}`).value) as { ScannedCount?: number }).ScannedCount ?? 0;
  }
  return { result, queries, read };
}

/** Camps from before ElectroDB, each too big for three to fit a DynamoDB page, so that a read of them crosses a page. */
export async function putOldCampsPastAPage(db: DynamoDBDocumentClient, table: string, p: string, locations: readonly string[]) {
  const padding = "x".repeat(350_000);
  for (const location of locations) {
    await db.send(new PutCommand({ TableName: table, Item: { ...playerKeys.camp(p, location), location, hallLevel: 1, padding } }));
  }
}
