import { randomUUID } from "node:crypto";

import { type DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { vi } from "vitest";

import { type AdventureOutcome, must } from "@heat/engine";

import { ITEM_VERSION } from "../src/db/keys.js";
import type { AdventureRecord, SettledResult } from "../src/db/repository.js";
import { RECENT_TTL_SECONDS, type RecentAdventure } from "../src/recent.js";
import { locationKeys, playerKeys, replayKeys } from "./keys.js";

/**
 * What the data-layer tests share for their data (typescript.md, rule 19): a
 * player no other test has, and an item as it is stored, read past the repository.
 */

export const player = () => `p-${randomUUID()}`;

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

/** A result of the given outcome with nothing else in it. */
export const emptyResult = (outcome: AdventureOutcome): SettledResult => ({ outcome, endedAtMs: 1000, reachedStage: 0, stages: [], rewards: [], credited: [], lost: [], heroes: [] });

/** A settled record of the job as settlement leaves it, settled at the given time: nobody's party home with nothing, unless overridden. */
export function settledAdventure(jobId: string, at: Date, overrides: Partial<AdventureRecord> = {}): AdventureRecord {
  const version = "0123456789abcdef0123456789abcdef01234567";
  return {
    adventureId: randomUUID(),
    playerId: player(),
    seed: randomUUID(),
    location: "millbrook",
    jobId,
    snapshot: { version, jobId, heroes: [] },
    version,
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
