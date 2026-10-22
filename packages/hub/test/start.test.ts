import { randomUUID } from "node:crypto";
import { PutCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { GraphQLError } from "graphql";
import { beforeAll, describe, expect, it } from "vitest";
import { UNIT_PROFILES } from "@heat/engine";
import { configFromEnv, createDocumentClient, type Tables } from "../src/db/client.js";
import { playerKeys } from "../src/db/keys.js";
import { Repository, type Hero, type HeroStatus } from "../src/db/repository.js";
import { recruitHero } from "../src/recruit.js";
import { retireHero } from "../src/retire.js";
import { startAdventure } from "../src/start.js";
import { submitAdventure } from "../src/submit.js";
import { MemoryTimelines } from "../src/timelines.js";

/**
 * startAdventure against DynamoDB Local: the job on the location's board,
 * the party validated, the snapshot issued and stamped, and the one-adventure
 * rule and the adventuring mark under concurrent starts and retires.
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
const wolves = "wolves-on-the-mill-road";
const version = "fedcba9876543210fedcba9876543210fedcba98";
const player = () => `p-${randomUUID()}`;

/** Heroes and a camp whose counts agree with them, as recruits and deaths leave them. */
async function putHeroes(p: string, statuses: HeroStatus[], location = at): Promise<Hero[]> {
  const heroes = statuses.map((status, i): Hero => ({
    id: randomUUID(), location, unitType: "villager", spriteSet: "villager-01", name: `Hero ${i}`,
    recruitedAt: new Date().toISOString(), level: 1, xp: 0, picks: [], status, retiredAt: null, adventureId: null,
  }));
  for (const hero of heroes) {
    await db.send(new PutCommand({ TableName: tables.player, Item: { ...playerKeys.hero(p, hero.id), ...hero } }));
  }
  await db.send(
    new PutCommand({
      TableName: tables.player,
      Item: {
        ...playerKeys.camp(p, location), location, hallLevel: 1, warehouseLevel: 1,
        activeHeroes: statuses.filter((s) => s !== "RETIRED").length,
        livingHeroes: statuses.filter((s) => s === "ALIVE").length,
      },
    }),
  );
  return heroes;
}

async function refusal(promise: Promise<unknown>): Promise<{ code: string; adventureId?: string } | undefined> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof GraphQLError) return e.extensions as { code: string; adventureId?: string };
    throw e;
  }
  return undefined;
}

describe("startAdventure", () => {
  it("starts the wolves job with the free villager: the record, the snapshot, the open item and the mark", async () => {
    const p = player();
    const villager = await recruitHero(repo, p, "villager", randomUUID());
    const now = new Date("2026-10-22T09:00:00Z");

    const started = await startAdventure(repo, p, version, at, wolves, [villager.id], now);

    expect(started).toMatchObject({ playerId: p, location: at, jobId: wolves, version, startedAt: now.toISOString(), status: "OPEN" });
    expect(started.seed).toMatch(/^[0-9a-f-]{36}$/);
    expect(started.snapshot).toEqual({
      version,
      jobId: wolves,
      heroes: [{
        heroId: villager.id, unitType: "villager", name: villager.name, spriteSet: villager.spriteSet, level: 1,
        stats: UNIT_PROFILES.villager!.stats,
      }],
    });
    expect(await repo.getAdventure(started.adventureId)).toEqual(started);
    expect(await repo.openAdventure(p)).toEqual({ adventureId: started.adventureId, seed: started.seed, startedAt: started.startedAt });
    expect((await repo.getHero(p, villager.id))?.adventureId).toBe(started.adventureId);
  });

  it("takes a party of up to four, in the order given", async () => {
    const p = player();
    const heroes = await putHeroes(p, ["ALIVE", "ALIVE", "ALIVE", "ALIVE"]);
    const ids = heroes.map((h) => h.id).reverse();
    const started = await startAdventure(repo, p, version, at, "timber-from-the-near-woods", ids);
    expect(started.snapshot.heroes.map((h) => h.heroId)).toEqual(ids);
  });

  it("refuses a second start while one is open, naming the open one", async () => {
    const p = player();
    const [a, b] = await putHeroes(p, ["ALIVE", "ALIVE"]);
    const first = await startAdventure(repo, p, version, at, wolves, [a!.id]);
    expect(await refusal(startAdventure(repo, p, version, at, wolves, [b!.id]))).toEqual({ code: "ADVENTURE_OPEN", adventureId: first.adventureId });
    expect((await repo.getHero(p, b!.id))?.adventureId).toBeNull();
  });

  it("refuses a job that is not on the location's board, and a location that does not exist", async () => {
    const p = player();
    const [hero] = await putHeroes(p, ["ALIVE"]);
    expect((await refusal(startAdventure(repo, p, version, at, "dragons-in-the-well", [hero!.id])))?.code).toBe("NO_SUCH_JOB");
    expect((await refusal(startAdventure(repo, p, version, at, "toString", [hero!.id])))?.code).toBe("NO_SUCH_JOB");
    expect((await refusal(startAdventure(repo, p, version, "atlantis", wolves, [hero!.id])))?.code).toBe("BAD_USER_INPUT");
  });

  it("refuses a party of none, of five, or with a hero twice", async () => {
    const p = player();
    const heroes = await putHeroes(p, ["ALIVE", "ALIVE", "ALIVE", "ALIVE", "ALIVE"]);
    const ids = heroes.map((h) => h.id);
    expect((await refusal(startAdventure(repo, p, version, at, wolves, [])))?.code).toBe("PARTY_SIZE");
    expect((await refusal(startAdventure(repo, p, version, at, wolves, ids)))?.code).toBe("PARTY_SIZE");
    expect((await refusal(startAdventure(repo, p, version, at, wolves, [ids[0]!, ids[0]!.toUpperCase()])))?.code).toBe("BAD_USER_INPUT");
    expect(await repo.openAdventure(p)).toBeUndefined();
  });

  it("refuses another player's hero, a hero elsewhere, a dead hero and a retired one", async () => {
    const p = player();
    const [theirs] = await putHeroes(player(), ["ALIVE"]);
    const [away] = await putHeroes(p, ["ALIVE"], "elsewhere");
    const [alive, dead, retired] = await putHeroes(p, ["ALIVE", "DEAD", "RETIRED"]);
    const code = async (ids: string[]) => (await refusal(startAdventure(repo, p, version, at, wolves, ids)))?.code;
    expect(await code([alive!.id, theirs!.id])).toBe("NOT_YOUR_HERO");
    expect(await code([randomUUID()])).toBe("NOT_YOUR_HERO");
    expect(await code([alive!.id, away!.id])).toBe("HERO_NOT_HERE");
    expect(await code([alive!.id, dead!.id])).toBe("HERO_DEAD");
    expect(await code([alive!.id, retired!.id])).toBe("HERO_RETIRED");
    expect(await repo.openAdventure(p)).toBeUndefined();
    expect((await repo.getHero(p, alive!.id))?.adventureId).toBeNull();
  });

  it("lets exactly one of several concurrent starts win, and answers the others with it", async () => {
    for (let round = 0; round < 5; round++) {
      const p = player();
      const heroes = await putHeroes(p, ["ALIVE", "ALIVE", "ALIVE"]);
      // Two starts with the same hero, one with another: every pair conflicts somewhere.
      const parties = [[heroes[0]!.id], [heroes[0]!.id], [heroes[1]!.id, heroes[2]!.id]];
      const results = await Promise.allSettled(parties.map((ids) => startAdventure(repo, p, version, at, wolves, ids)));
      const won = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      expect(won).toHaveLength(1);
      const winner = won[0]!;
      for (const r of results) {
        if (r.status === "rejected") expect(r.reason.extensions).toEqual({ code: "ADVENTURE_OPEN", adventureId: winner.adventureId });
      }
      expect((await repo.openAdventure(p))?.adventureId).toBe(winner.adventureId);
      const marked = (await repo.heroes(p)).filter((h) => h.adventureId !== null).map((h) => h.id).sort();
      expect(marked).toEqual(winner.snapshot.heroes.map((h) => h.heroId).sort());
    }
  });
});

describe("no retiring a hero while it is adventuring", () => {
  it("refuses the retire until the adventure is settled, or until the hero is dead", async () => {
    const p = player();
    const villager = await recruitHero(repo, p, "villager", randomUUID());
    const started = await startAdventure(repo, p, version, at, wolves, [villager.id]);
    expect((await refusal(retireHero(repo, p, villager.id)))?.code).toBe("HERO_ADVENTURING");
    expect((await repo.getHero(p, villager.id))?.status).toBe("ALIVE");

    // A lone villager does not survive the wolves (settle.test.ts); a dead
    // hero may retire, and its mark is gone with the settlement.
    await submitAdventure(repo, new MemoryTimelines(), p, version, started.adventureId, []);
    expect((await repo.getHero(p, villager.id))?.adventureId).toBeNull();
    expect((await retireHero(repo, p, villager.id)).status).toBe("RETIRED");
  });

  it("holds the rule in the transaction, against a hero read before the start", async () => {
    const p = player();
    const [hero] = await putHeroes(p, ["ALIVE"]);
    const stale = (await repo.getHero(p, hero!.id))!;
    await startAdventure(repo, p, version, at, wolves, [hero!.id]);
    await expect(repo.retire(p, stale)).rejects.toThrow();
    expect((await repo.getHero(p, hero!.id))?.status).toBe("ALIVE");
  });

  it("lets a start and a retire of the same hero race to one consistent end", async () => {
    for (let round = 0; round < 5; round++) {
      const p = player();
      const [hero] = await putHeroes(p, ["ALIVE"]);
      const [start, retire] = await Promise.allSettled([
        startAdventure(repo, p, version, at, wolves, [hero!.id]),
        retireHero(repo, p, hero!.id),
      ]);
      const after = (await repo.getHero(p, hero!.id))!;
      const open = await repo.openAdventure(p);
      if (start.status === "fulfilled") {
        // The start won: the hero is on it and still alive.
        expect(after).toMatchObject({ status: "ALIVE", adventureId: start.value.adventureId });
        expect(retire.status).toBe("rejected");
      } else {
        // The start lost: no adventure, and the hero retired or is untouched.
        expect(open).toBeUndefined();
        expect(after.adventureId).toBeNull();
        expect(after.status).toBe(retire.status === "fulfilled" ? "RETIRED" : "ALIVE");
      }
      expect(await repo.camp(p, at)).toMatchObject({ livingHeroes: after.status === "ALIVE" ? 1 : 0 });
    }
  });
});
