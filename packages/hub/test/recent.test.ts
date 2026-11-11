import { randomUUID } from "node:crypto";

import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { range } from "es-toolkit";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { configFromEnv, createDocumentClient, type Tables } from "../src/db/client.js";
import { Repository } from "../src/db/repository.js";
import { RECENT_READ, RECENT_TTL_SECONDS, type RecentAdventure, recentAdventuresAt } from "../src/recent.js";
import { putRecentAdventure, reads, recentAdventure as recent } from "./data.js";

/**
 * The adventures recently completed at a location, as they are read
 * (decision 0050): newest first, from one Query of at most RECENT_READ items,
 * without the expired and without a job this version does not know. The
 * write, in the settle transaction and never in a discard, is settle.test.ts.
 * DynamoDB Local does not run TTL deletions, so what is proven is the filter
 * on the expiry, not AWS deleting.
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

afterEach(() => {
  vi.restoreAllMocks();
});

/** Each test its own location, so no other test's adventures are in its list. */
const place = () => `test-${randomUUID()}`;
const now = new Date("2026-11-10T12:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

const put = (item: RecentAdventure) => putRecentAdventure(db, tables.location, item);

describe("the adventures recently completed at a location", () => {
  it("answers each adventure as it was written, newest first", async () => {
    const at = place();
    const older = await put(recent(at, minutesAgo(30), { outcome: "retreat", credited: [] }));
    const newest = await put(recent(at, minutesAgo(1)));
    const middle = await put(recent(at, minutesAgo(10), { outcome: "defeat", party: [{ name: "Bram", unitType: "fighter", spriteSet: "fighter-01", level: 1, died: true }] }));
    expect(await recentAdventuresAt(repo, at, now)).toEqual([newest, middle, older]);
  });

  it(`reads at most ${RECENT_READ} items in one Query, the newest of them`, async () => {
    const at = place();
    const all: RecentAdventure[] = [];
    for (const i of range(RECENT_READ + 5)) all.push(await put(recent(at, minutesAgo(i))));
    const { result, queries, read } = await reads(db, tables.location, () => recentAdventuresAt(repo, at, now));
    expect(queries).toBe(1);
    expect(read).toBe(RECENT_READ);
    expect(result.map((r) => r.adventureId)).toEqual(all.slice(0, RECENT_READ).map((r) => r.adventureId));
  });

  it("leaves out adventures past their expiry, which DynamoDB may not have deleted yet, and reads no further to replace them", async () => {
    const at = place();
    const fresh: RecentAdventure[] = [];
    for (const i of range(RECENT_READ - 2)) fresh.push(await put(recent(at, minutesAgo(i + 2))));
    // The two newest keys carry an expiry already past, which only a clock set back could write; the filter is what is under test.
    await put(recent(at, minutesAgo(0), { expiresAt: Math.floor(now.getTime() / 1000) - 60 }));
    await put(recent(at, minutesAgo(1), { expiresAt: Math.floor(now.getTime() / 1000) }));
    await put(recent(at, minutesAgo(60)));
    const { result, queries, read } = await reads(db, tables.location, () => recentAdventuresAt(repo, at, now));
    expect(queries).toBe(1);
    expect(read).toBe(RECENT_READ);
    expect(result.map((r) => r.adventureId)).toEqual(fresh.map((r) => r.adventureId));

    const aWeekOn = new Date(now.getTime() + RECENT_TTL_SECONDS * 1000);
    expect(await recentAdventuresAt(repo, at, aWeekOn)).toEqual([]);
  });

  it("keeps two adventures settled in the same millisecond", async () => {
    const at = place();
    const both = [await put(recent(at, now)), await put(recent(at, now))];
    const listed = await recentAdventuresAt(repo, at, now);
    expect(listed.map((r) => r.adventureId).sort()).toEqual(both.map((r) => r.adventureId).sort());
  });

  it("leaves out an adventure of a job this version does not know", async () => {
    const at = place();
    const known = await put(recent(at, minutesAgo(2)));
    await put(recent(at, minutesAgo(1), { jobId: "a-job-of-another-version" }));
    expect(await recentAdventuresAt(repo, at, now)).toEqual([known]);
  });

  it("is empty where nothing has settled", async () => {
    expect(await recentAdventuresAt(repo, place(), now)).toEqual([]);
  });
});
