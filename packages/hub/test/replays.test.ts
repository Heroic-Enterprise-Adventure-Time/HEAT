import { randomUUID } from "node:crypto";

import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { range } from "es-toolkit";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { configFromEnv, createDocumentClient, type Tables } from "../src/db/client.js";
import { type AdventureRecord, Repository } from "../src/db/repository.js";
import { recruitHero } from "../src/recruit.js";
import { REPLAYS_READ, replaysOf } from "../src/replays.js";
import { startAdventure } from "../src/start.js";
import { submitAdventure } from "../src/submit.js";
import { MemoryTimelines } from "../src/timelines.js";
import { emptyResult, player, putSettledAdventure, reads, settledAdventure as settled, storedItem } from "./data.js";
import { locationKeys, replayKeys } from "./keys.js";
import { VERSION as version } from "./versions.js";

/**
 * The replays of a job (decision 0050), against DynamoDB Local with the
 * location table's index as Terraform makes it: the index's keys on the
 * record as stored, written at settlement and at no other time, which is
 * what decision 0050 left to be checked of ElectroDB; and the read, newest
 * first, every outcome, from one Query of at most REPLAYS_READ records.
 *
 * A read of a global secondary index is eventually consistent, on DynamoDB
 * Local as on AWS, so a test that writes and then reads waits for the answer.
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

const at = "millbrook";
const timber = "timber-from-the-near-woods";

/** Each read test its own job, which no content knows, so no other test's adventures are in its list. */
const job = () => `test-${randomUUID()}`;
const now = new Date("2026-11-11T12:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

const put = (record: AdventureRecord) => putSettledAdventure(db, tables.location, record);
const stored = (adventureId: string) => storedItem(db, tables.location, locationKeys.adventure(adventureId));

/** A player's adventure on the timber job, open, with the free villager. */
async function opened(p: string) {
  const villager = await recruitHero(repo, p, "villager", randomUUID());
  return startAdventure(repo, p, version, randomUUID(), at, timber, [villager.id]);
}

describe("the index's keys on the adventure record", () => {
  it("are absent while the adventure is open", async () => {
    const started = await opened(player());
    const item = await stored(started.adventureId);
    expect(item).toMatchObject({ status: "OPEN", jobId: timber });
    expect(item).not.toHaveProperty("GSI1PK");
    expect(item).not.toHaveProperty("GSI1SK");
    expect(item).not.toHaveProperty("replayOf");
  });

  it("are the job and the time it settled, from settlement on", async () => {
    const p = player();
    const started = await opened(p);
    const settledAt = new Date();
    await submitAdventure(repo, new MemoryTimelines(), p, version, started.adventureId, [], settledAt);
    const item = await stored(started.adventureId);
    expect(item).toMatchObject({ status: "SETTLED", jobId: timber, replayOf: timber, settledAt: settledAt.toISOString(), ...replayKeys(timber, settledAt.toISOString()) });
    // What the index answers is the record whole, as a read by its id answers it.
    const record = await repo.getAdventure(started.adventureId);
    await vi.waitFor(async () => {
      expect(await repo.replays(timber, 1000)).toContainEqual(record);
    });
  });

  it("are absent on a discarded record, which is in no job's replays", async () => {
    const p = player();
    const started = await opened(p);
    await repo.discard(p, started);
    const item = await stored(started.adventureId);
    expect(item).toMatchObject({ status: "DISCARDED" });
    expect(item).not.toHaveProperty("GSI1PK");
    expect(item).not.toHaveProperty("GSI1SK");
    expect((await repo.replays(timber, 1000)).map((r) => r.adventureId)).not.toContain(started.adventureId);
  });
});

describe("the replays of a job", () => {
  it("answers each record as it is stored, newest first, whatever its outcome", async () => {
    const of = job();
    const older = await put(settled(of, minutesAgo(30), { result: emptyResult("retreat") }));
    const newest = await put(settled(of, minutesAgo(1)));
    const middle = await put(settled(of, minutesAgo(10), { result: emptyResult("defeat") }));
    await vi.waitFor(async () => {
      expect(await replaysOf(repo, of)).toEqual([newest, middle, older]);
    });
  });

  it(`reads at most ${REPLAYS_READ} records in one Query, the newest of them`, async () => {
    const of = job();
    const all: AdventureRecord[] = [];
    for (const i of range(REPLAYS_READ + 5)) all.push(await put(settled(of, minutesAgo(i))));
    await vi.waitFor(async () => {
      expect(await repo.replays(of, 1000)).toHaveLength(all.length);
    });
    const { result, queries, read } = await reads(db, tables.location, () => replaysOf(repo, of));
    expect(queries).toBe(1);
    expect(read).toBe(REPLAYS_READ);
    expect(result.map((r) => r.adventureId)).toEqual(all.slice(0, REPLAYS_READ).map((r) => r.adventureId));
  });

  it("answers only the job's own", async () => {
    const of = job();
    const mine = await put(settled(of, minutesAgo(1)));
    await put(settled(job(), now));
    await vi.waitFor(async () => {
      expect(await replaysOf(repo, of)).toEqual([mine]);
    });
  });

  it("is empty for a job nothing has settled", async () => {
    expect(await replaysOf(repo, job())).toEqual([]);
  });
});
