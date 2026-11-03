import { randomUUID } from "node:crypto";

import { type DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { beforeAll, describe, expect, it } from "vitest";

import { must, UNIT_PROFILES } from "@heat/engine";

import { buildFacility } from "../src/build.js";
import { configFromEnv, createDocumentClient, type Tables } from "../src/db/client.js";
import { playerKeys } from "../src/db/keys.js";
import { type AdventureRecord, type Camp, type Hero, type HeroStatus, Repository } from "../src/db/repository.js";
import { recruitHero } from "../src/recruit.js";
import { AdventureOpen, HeroAdventuring, HeroDead, HeroNotHere, HeroRetired, Requires } from "../src/refusals.js";
import { retireHero } from "../src/retire.js";
import { startAdventure } from "../src/start.js";
import { submitAdventure } from "../src/submit.js";
import { MemoryTimelines } from "../src/timelines.js";
import { everyInterleaving, winnerBefore } from "./race.js";
import { BAD_USER_INPUT, refusal } from "./refusal.js";

/**
 * startAdventure against DynamoDB Local: the job on the location's board,
 * or at a facility the camp has built, the party validated, the snapshot issued and stamped, and the one-adventure
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
        stats: must(UNIT_PROFILES.villager, "the villager profile").stats,
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
    const heroes = await putHeroes(p, ["ALIVE", "ALIVE"]);
    const a = must(heroes[0], "hero a");
    const b = must(heroes[1], "hero b");
    const first = await startAdventure(repo, p, version, at, wolves, [a.id]);
    const refused = await refusal(startAdventure(repo, p, version, at, wolves, [b.id]));
    expect(refused).toBeInstanceOf(AdventureOpen);
    expect(refused).toMatchObject({ adventureId: first.adventureId });
    expect((await repo.getHero(p, b.id))?.adventureId).toBeNull();
  });

  it("refuses a job that is not on the location's board, and a location that does not exist", async () => {
    const p = player();
    const hero = must((await putHeroes(p, ["ALIVE"]))[0], "the hero");
    expect(await refusal(startAdventure(repo, p, version, at, "dragons-in-the-well", [hero.id]))).toMatchObject(BAD_USER_INPUT);
    expect(await refusal(startAdventure(repo, p, version, at, "toString", [hero.id]))).toMatchObject(BAD_USER_INPUT);
    expect(await refusal(startAdventure(repo, p, version, "atlantis", wolves, [hero.id]))).toMatchObject(BAD_USER_INPUT);
  });

  it("refuses a party of none, of five, or with a hero twice", async () => {
    const p = player();
    const heroes = await putHeroes(p, ["ALIVE", "ALIVE", "ALIVE", "ALIVE", "ALIVE"]);
    const ids = heroes.map((h) => h.id);
    const first = must(ids[0], "the first id");
    expect(await refusal(startAdventure(repo, p, version, at, wolves, []))).toMatchObject(BAD_USER_INPUT);
    expect(await refusal(startAdventure(repo, p, version, at, wolves, ids))).toMatchObject(BAD_USER_INPUT);
    expect(await refusal(startAdventure(repo, p, version, at, wolves, [first, first.toUpperCase()]))).toMatchObject(BAD_USER_INPUT);
    expect(await repo.openAdventure(p)).toBeUndefined();
  });

  it("refuses another player's hero, a hero elsewhere, a dead hero and a retired one", async () => {
    const p = player();
    const theirs = must((await putHeroes(player(), ["ALIVE"]))[0], "their hero");
    const away = must((await putHeroes(p, ["ALIVE"], "elsewhere"))[0], "the hero elsewhere");
    const heroes = await putHeroes(p, ["ALIVE", "DEAD", "RETIRED"]);
    const alive = must(heroes[0], "the living hero");
    const dead = must(heroes[1], "the dead hero");
    const retired = must(heroes[2], "the retired hero");
    const refused = (ids: string[]) => refusal(startAdventure(repo, p, version, at, wolves, ids));
    // Another player's hero is not said to exist, so it is the client's defect, not a refusal.
    expect(await refused([alive.id, theirs.id])).toMatchObject(BAD_USER_INPUT);
    expect(await refused([randomUUID()])).toMatchObject(BAD_USER_INPUT);
    expect(await refused([alive.id, away.id])).toBeInstanceOf(HeroNotHere);
    expect(await refused([alive.id, dead.id])).toBeInstanceOf(HeroDead);
    expect(await refused([alive.id, retired.id])).toBeInstanceOf(HeroRetired);
    expect(await refused([alive.id, dead.id])).toMatchObject({ heroId: dead.id });
    expect(await repo.openAdventure(p)).toBeUndefined();
    expect((await repo.getHero(p, alive.id))?.adventureId).toBeNull();
  });

  it("lets exactly one of several concurrent starts win, and answers the others with it", async () => {
    for (let round = 0; round < 5; round++) {
      const p = player();
      const heroes = await putHeroes(p, ["ALIVE", "ALIVE", "ALIVE"]);
      const first = must(heroes[0], "the first hero").id;
      const second = must(heroes[1], "the second hero").id;
      const third = must(heroes[2], "the third hero").id;
      // Two starts with the same hero, one with another: every pair conflicts somewhere.
      const parties = [[first], [first], [second, third]];
      const results = await Promise.allSettled(parties.map((ids) => startAdventure(repo, p, version, at, wolves, ids)));
      const won = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      expect(won).toHaveLength(1);
      const winner = must(won[0], "the winning start");
      for (const r of results) {
        if (r.status === "rejected") {
          expect(r.reason).toBeInstanceOf(AdventureOpen);
          expect(r.reason).toMatchObject({ adventureId: winner.adventureId });
        }
      }
      expect((await repo.openAdventure(p))?.adventureId).toBe(winner.adventureId);
      const marked = (await repo.heroes(p)).filter((h) => h.adventureId !== null).map((h) => h.id).sort();
      expect(marked).toEqual(winner.snapshot.heroes.map((h) => h.heroId).sort());
    }
  });

  it("answers AdventureOpen, naming the winner, wherever another start of the same hero commits", async () => {
    const runs = await everyInterleaving(async (k) => {
      const p = player();
      const hero = must((await putHeroes(p, ["ALIVE"]))[0], "the hero");
      let winner: AdventureRecord | undefined;
      const late = winnerBefore(repo, k, async () => (winner = await startAdventure(repo, p, version, at, wolves, [hero.id])));
      const lost = await refusal(startAdventure(late.repo, p, version, at, wolves, [hero.id]));
      if (!late.ran()) return false;
      expect(lost).toBeInstanceOf(AdventureOpen);
      expect(lost).toMatchObject({ adventureId: winner?.adventureId });
      return true;
    });
    // Before each of openAdventure, getHero and startAdventure.
    expect(runs).toBe(3);
  });
});

describe("a facility's job (Issue-133)", () => {
  const ore = "ore-from-the-hill";

  /** The mine built as a player builds it: paid for with the timber run's 60 timber and 3 cloth. */
  async function buildMine(p: string): Promise<void> {
    await repo.setBalance(p, at, "timber", 60);
    await repo.setBalance(p, at, "cloth", 3);
    await buildFacility(repo, p, at, "mine", 1);
  }

  it("refuses the mine's job while the camp has not built the mine, and writes nothing", async () => {
    const p = player();
    const hero = must((await putHeroes(p, ["ALIVE"]))[0], "the hero");
    const refused = await refusal(startAdventure(repo, p, version, at, ore, [hero.id]));
    expect(refused).toBeInstanceOf(Requires);
    expect(refused).toMatchObject({ missing: [{ kind: "mine", level: 1 }] });
    expect(await repo.openAdventure(p)).toBeUndefined();
    expect((await repo.getHero(p, hero.id))?.adventureId).toBeNull();
  });

  it("starts the mine's job once the camp has built the mine", async () => {
    const p = player();
    const hero = must((await putHeroes(p, ["ALIVE"]))[0], "the hero");
    await buildMine(p);
    const started = await startAdventure(repo, p, version, at, ore, [hero.id]);
    expect(started).toMatchObject({ location: at, jobId: ore, status: "OPEN" });
    expect((await repo.openAdventure(p))?.adventureId).toBe(started.adventureId);
    expect((await repo.getHero(p, hero.id))?.adventureId).toBe(started.adventureId);
  });

  it("holds the rule in the transaction, against a camp read with the mine built", async () => {
    const p = player();
    const hero = must((await putHeroes(p, ["ALIVE"]))[0], "the hero");
    // The first read of the camp sees a mine, as no camp yet can lose one; the transaction finds no mine item.
    let reads = 0;
    const stale = new Proxy(repo, {
      get: (target, key, receiver): unknown =>
        key === "camp"
          ? async (id: string, location: string): Promise<Camp> => {
              const camp = await target.camp(id, location);
              return reads++ === 0 ? { ...camp, facilities: { ...camp.facilities, mine: 1 } } : camp;
            }
          : Reflect.get(target, key, receiver),
    });
    const refused = await refusal(startAdventure(stale, p, version, at, ore, [hero.id]));
    expect(refused).toBeInstanceOf(Requires);
    expect(refused).toMatchObject({ missing: [{ kind: "mine", level: 1 }] });
    expect(await repo.openAdventure(p)).toBeUndefined();
    expect((await repo.getHero(p, hero.id))?.adventureId).toBeNull();
  });

  it("needs nothing built for a job on the job board", async () => {
    const p = player();
    const hero = must((await putHeroes(p, ["ALIVE"]))[0], "the hero");
    expect((await startAdventure(repo, p, version, at, wolves, [hero.id])).jobId).toBe(wolves);
  });
});

describe("no retiring a hero while it is adventuring", () => {
  it("refuses the retire until the adventure is settled, or until the hero is dead", async () => {
    const p = player();
    const villager = await recruitHero(repo, p, "villager", randomUUID());
    const started = await startAdventure(repo, p, version, at, wolves, [villager.id]);
    expect(await refusal(retireHero(repo, p, villager.id))).toBeInstanceOf(HeroAdventuring);
    expect((await repo.getHero(p, villager.id))?.status).toBe("ALIVE");

    // A lone villager does not survive the wolves (settle.test.ts); a dead
    // hero may retire, and its mark is gone with the settlement.
    await submitAdventure(repo, new MemoryTimelines(), p, version, started.adventureId, []);
    expect((await repo.getHero(p, villager.id))?.adventureId).toBeNull();
    expect((await retireHero(repo, p, villager.id)).status).toBe("RETIRED");
  });

  it("holds the rule in the transaction, against a hero read before the start", async () => {
    const p = player();
    const hero = must((await putHeroes(p, ["ALIVE"]))[0], "the hero");
    const stale = must(await repo.getHero(p, hero.id), "the hero");
    await startAdventure(repo, p, version, at, wolves, [hero.id]);
    await expect(repo.retire(p, stale)).rejects.toThrow();
    expect((await repo.getHero(p, hero.id))?.status).toBe("ALIVE");
  });

  it("lets a start and a retire of the same hero race to one consistent end", async () => {
    for (let round = 0; round < 5; round++) {
      const p = player();
      const hero = must((await putHeroes(p, ["ALIVE"]))[0], "the hero");
      const [start, retire] = await Promise.allSettled([
        startAdventure(repo, p, version, at, wolves, [hero.id]),
        retireHero(repo, p, hero.id),
      ]);
      const after = must(await repo.getHero(p, hero.id), "the hero");
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
