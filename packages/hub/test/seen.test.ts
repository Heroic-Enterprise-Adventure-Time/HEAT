import { randomInt, randomUUID } from "node:crypto";

import { type DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { must } from "@heat/engine";

import { configFromEnv, createDocumentClient, type Tables } from "../src/db/client.js";
import { locationKeys, playerKeys } from "../src/db/keys.js";
import { type Hero, Repository } from "../src/db/repository.js";
import { recruitHero } from "../src/recruit.js";
import { retireHero } from "../src/retire.js";
import { heroesSeenAt, type Random, SAMPLE_READ, SAMPLE_SIZE, SIGHTING_TTL_SECONDS, sightingOf } from "../src/seen.js";
import { player } from "./data.js";

/**
 * The heroes seen at a location (decision 0029): recruit writes a sighting
 * and retire deletes it, in their transactions; the sample reads at most
 * SAMPLE_READ items, returns at most SAMPLE_SIZE, and leaves out the expired
 * and the caller's own. DynamoDB Local does not run TTL deletions, so what
 * is proven is the expiry written and the filter on it, not AWS deleting.
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

/** Each test its own location, so other tests' sightings never land in its sample. */
const place = () => `test-${randomUUID()}`;

function hero(location: string, overrides: Partial<Hero> = {}): Hero {
  return {
    id: randomUUID(), location, unitType: "villager", spriteSet: "villager-01", name: "Ada",
    recruitedAt: new Date().toISOString(), level: 1, xp: 0, picks: [], status: "ALIVE", retiredAt: null, adventureId: null, ...overrides,
  };
}

async function putSighting(h: Hero, at = new Date()): Promise<void> {
  await db.send(new PutCommand({ TableName: tables.location, Item: { ...locationKeys.seen(h.location, h.id), ...sightingOf(h, at) } }));
}

async function putOwnHero(p: string, h: Hero): Promise<void> {
  await db.send(new PutCommand({ TableName: tables.player, Item: { ...playerKeys.hero(p, h.id), ...h } }));
}

/** Items the location table's Queries read during `run`, and how many Queries there were. */
async function reads<T>(run: () => Promise<T>): Promise<{ result: T; queries: number; read: number }> {
  const send = vi.spyOn(db, "send");
  const result = await run();
  let queries = 0;
  let read = 0;
  for (const [i, [command]] of send.mock.calls.entries()) {
    if (!(command instanceof QueryCommand) || command.input.TableName !== tables.location) continue;
    queries++;
    read += ((await must(send.mock.results[i], `the result of call ${i}`).value) as { ScannedCount?: number }).ScannedCount ?? 0;
  }
  return { result, queries, read };
}

/** A source of randomness whose window starts at the given hex digit, then random. */
function startingAt(digit: number): Random {
  let first = true;
  return (max) => {
    if (first && max === 16) {
      first = false;
      return digit;
    }
    return randomInt(max);
  };
}

describe("the sample of heroes seen at a location", () => {
  it(`reads at most ${SAMPLE_READ} items and returns at most ${SAMPLE_SIZE}, from any starting point`, async () => {
    const at = place();
    for (let i = 0; i < 40; i++) await putSighting(hero(at));
    for (const digit of [0, 7, 15]) {
      const { result, queries, read } = await reads(() => heroesSeenAt(repo, player(), at, startingAt(digit)));
      expect(result).toHaveLength(SAMPLE_SIZE);
      expect(new Set(result.map((s) => s.heroId)).size).toBe(SAMPLE_SIZE);
      expect(queries).toBeGreaterThan(0);
      expect(queries).toBeLessThanOrEqual(2);
      expect(read).toBeLessThanOrEqual(SAMPLE_READ);
      vi.restoreAllMocks();
    }
  });

  it("wraps round to the start of the collection, so a few heroes are all found from any point", async () => {
    const at = place();
    const few = [hero(at), hero(at), hero(at)];
    for (const h of few) await putSighting(h);
    for (const digit of [0, 7, 15]) {
      const seen = await heroesSeenAt(repo, player(), at, startingAt(digit));
      expect(seen.map((s) => s.heroId).sort()).toEqual(few.map((h) => h.id).sort());
    }
  });

  it("leaves out sightings past their expiry, which DynamoDB may not have deleted yet", async () => {
    const at = place();
    const fresh = hero(at);
    const stale = hero(at);
    await putSighting(fresh);
    await putSighting(stale, new Date(Date.now() - (SIGHTING_TTL_SECONDS + 60) * 1000));
    const seen = await heroesSeenAt(repo, player(), at);
    expect(seen.map((s) => s.heroId)).toEqual([fresh.id]);
  });

  it("leaves out the caller's own heroes", async () => {
    const at = place();
    const me = player();
    const mine = hero(at);
    const theirs = hero(at);
    await putOwnHero(me, mine);
    await putSighting(mine);
    await putSighting(theirs);
    const seen = await heroesSeenAt(repo, me, at);
    expect(seen.map((s) => s.heroId)).toEqual([theirs.id]);
  });
});

describe("sightings written by the flows that change a hero", () => {
  it("recruit writes the hero's public fields, no owner, expiring a week after it was recruited", async () => {
    const p = player();
    const made = await recruitHero(repo, p, "villager", randomUUID());
    const r = await db.send(new GetCommand({ TableName: tables.location, Key: locationKeys.seen(made.location, made.id) }));
    const recruited = Math.floor(new Date(made.recruitedAt).getTime() / 1000);
    expect(r.Item).toEqual({
      ...locationKeys.seen(made.location, made.id),
      heroId: made.id,
      location: made.location,
      name: made.name,
      unitType: made.unitType,
      spriteSet: made.spriteSet,
      level: 1,
      seenAt: made.recruitedAt,
      expiresAt: recruited + 7 * 24 * 60 * 60,
      // ElectroDB's identifiers, which say what the item is and nothing of whose (decision 0041).
      __edb_e__: "sighting",
      __edb_v__: "1",
    });
    expect(JSON.stringify(r.Item)).not.toContain(p);
  });

  it("retire deletes the hero's sighting, so it leaves other players' camps", async () => {
    const p = player();
    const made = await recruitHero(repo, p, "villager", randomUUID());
    await retireHero(repo, p, made.id);
    const r = await db.send(new GetCommand({ TableName: tables.location, Key: locationKeys.seen(made.location, made.id) }));
    expect(r.Item).toBeUndefined();
  });
});
