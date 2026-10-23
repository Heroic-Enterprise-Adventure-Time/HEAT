import { randomUUID } from "node:crypto";
import { GetCommand, PutCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { GraphQLError } from "graphql";
import { beforeAll, describe, expect, it } from "vitest";
import { configFromEnv, createDocumentClient, type Tables } from "../src/db/client.js";
import { playerKeys } from "../src/db/keys.js";
import { HeroChanged, Repository, type Hero, type HeroStatus } from "../src/db/repository.js";
import { recruitHero } from "../src/recruit.js";
import { retireHero } from "../src/retire.js";
import { must } from "./must.js";

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
const player = () => `p-${randomUUID()}`;

/** Heroes and a camp whose counts agree with them, as recruits and deaths will leave them. */
async function putCamp(p: string, statuses: HeroStatus[]): Promise<Hero[]> {
  const heroes = statuses.map((status, i): Hero => ({
    id: randomUUID(), location: at, unitType: "villager", spriteSet: "villager-01", name: `Hero ${i}`,
    recruitedAt: new Date().toISOString(), level: 1, xp: 0, picks: [], status, retiredAt: null, adventureId: null,
  }));
  for (const hero of heroes) {
    await db.send(new PutCommand({ TableName: tables.player, Item: { ...playerKeys.hero(p, hero.id), ...hero } }));
  }
  const active = statuses.filter((s) => s !== "RETIRED").length;
  const living = statuses.filter((s) => s === "ALIVE").length;
  await db.send(
    new PutCommand({
      TableName: tables.player,
      Item: { ...playerKeys.camp(p, at), location: at, hallLevel: 1, warehouseLevel: 1, activeHeroes: active, livingHeroes: living },
    }),
  );
  return heroes;
}

/** The camp's counts are what the heroes' statuses say they should be. */
async function expectCountsAgree(p: string) {
  const heroes = await repo.heroes(p);
  expect(await repo.camp(p, at)).toMatchObject({
    activeHeroes: heroes.filter((h) => h.status !== "RETIRED").length,
    livingHeroes: heroes.filter((h) => h.status === "ALIVE").length,
  });
}

async function refusal(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof GraphQLError) return e.extensions["code"] as string;
    throw e;
  }
  return undefined;
}

describe("retireHero", () => {
  it("retires a living hero and counts it out of the active and the living heroes", async () => {
    const p = player();
    const villager = await recruitHero(repo, p, "villager", randomUUID());
    const now = new Date("2026-10-21T12:00:00Z");
    const retired = await retireHero(repo, p, villager.id, now);
    expect(retired).toEqual({ ...villager, status: "RETIRED", retiredAt: now.toISOString() });
    expect(await repo.getHero(p, villager.id)).toEqual(retired);
    expect(await repo.camp(p, at)).toMatchObject({ activeHeroes: 0, livingHeroes: 0 });
  });

  it("retires a dead hero out of the active heroes only", async () => {
    const p = player();
    const dead = must((await putCamp(p, ["DEAD", "ALIVE"]))[0], "the dead hero");
    await retireHero(repo, p, dead.id);
    expect(await repo.camp(p, at)).toMatchObject({ activeHeroes: 1, livingHeroes: 1 });
  });

  it("answers a repeated request with the hero as it is, and counts it out once", async () => {
    const p = player();
    const hero = must((await putCamp(p, ["ALIVE", "DEAD"]))[0], "the hero");
    const first = await retireHero(repo, p, hero.id);
    expect(await retireHero(repo, p, hero.id)).toEqual(first);
    expect(await repo.camp(p, at)).toMatchObject({ activeHeroes: 1, livingHeroes: 0 });
  });

  it("counts a hero out once when two retires race", async () => {
    const p = player();
    const hero = must((await putCamp(p, ["ALIVE", "ALIVE", "DEAD"]))[0], "the hero");
    const results = await Promise.all([1, 2].map(() => retireHero(repo, p, hero.id)));
    expect(results.map((h) => h.status)).toEqual(["RETIRED", "RETIRED"]);
    expect(await repo.camp(p, at)).toMatchObject({ activeHeroes: 2, livingHeroes: 1 });
    await expectCountsAgree(p);
  });

  it("holds the counts in the transaction, against a hero read before another retire", async () => {
    const p = player();
    const hero = must((await putCamp(p, ["ALIVE"]))[0], "the hero");
    const stale = must(await repo.getHero(p, hero.id), "the hero");
    await retireHero(repo, p, hero.id);
    await expect(repo.retire(p, stale)).rejects.toBeInstanceOf(HeroChanged);
    expect(await repo.camp(p, at)).toMatchObject({ activeHeroes: 0, livingHeroes: 0 });
  });

  it("makes the villager free again when the camp's only living hero retires", async () => {
    const p = player();
    const villager = await recruitHero(repo, p, "villager", randomUUID());
    expect(await refusal(recruitHero(repo, p, "villager", randomUUID()))).toBe("INSUFFICIENT_RESOURCES");
    await retireHero(repo, p, villager.id);
    const next = await recruitHero(repo, p, "villager", randomUUID());
    expect(next.status).toBe("ALIVE");
    expect(await repo.camp(p, at)).toMatchObject({ activeHeroes: 1, livingHeroes: 1 });
  });

  it("frees a slot in a hall full of dead heroes", async () => {
    const p = player();
    const dead = must((await putCamp(p, ["DEAD", "DEAD", "DEAD", "DEAD"]))[0], "the dead hero");
    expect(await refusal(recruitHero(repo, p, "villager", randomUUID()))).toBe("HALL_FULL");
    await retireHero(repo, p, dead.id);
    await recruitHero(repo, p, "villager", randomUUID());
    expect(await repo.camp(p, at)).toMatchObject({ activeHeroes: 4, livingHeroes: 1 });
  });

  it("keeps the counts true when a retire races a recruit for the last slot", async () => {
    // The recruit wins only if it reads the camp after the retire; either
    // way the hall never passes its cap and the counts match the heroes.
    for (let round = 0; round < 5; round++) {
      const p = player();
      const dead = must((await putCamp(p, ["DEAD", "DEAD", "DEAD", "DEAD"]))[0], "the dead hero");
      const [retire, recruit] = await Promise.allSettled([
        retireHero(repo, p, dead.id),
        recruitHero(repo, p, "villager", randomUUID()),
      ]);
      expect(retire.status).toBe("fulfilled");
      const heroes = await repo.heroes(p);
      expect(heroes).toHaveLength(recruit.status === "fulfilled" ? 5 : 4);
      expect(heroes.filter((h) => h.status !== "RETIRED").length).toBeLessThanOrEqual(4);
      await expectCountsAgree(p);
    }
  });

  it("pays for a paid recruit only if it is made, when it races a retire for the last slot", async () => {
    // A full hall of living heroes and timber for two villagers. The recruit
    // wins only if it reads the camp after the retire; either way the hall
    // never passes its cap, the counts match the heroes, and the timber and
    // the ledger show one debit exactly when a hero was made.
    for (let round = 0; round < 5; round++) {
      const p = player();
      const leaving = must((await putCamp(p, ["ALIVE", "ALIVE", "ALIVE", "ALIVE"]))[0], "the leaving hero");
      await repo.setBalance(p, at, "timber", 40);
      const requestId = randomUUID();
      const [retire, recruit] = await Promise.allSettled([
        retireHero(repo, p, leaving.id),
        recruitHero(repo, p, "villager", requestId),
      ]);
      expect(retire.status).toBe("fulfilled");
      const made = recruit.status === "fulfilled";
      if (!made) expect(recruit.reason).toBeInstanceOf(GraphQLError);
      expect(await repo.heroes(p)).toHaveLength(made ? 5 : 4);
      await expectCountsAgree(p);
      expect(await repo.holdings(p, at)).toEqual([{ material: "timber", balance: made ? 20 : 40 }]);
      const ledger = await db.send(new GetCommand({ TableName: tables.player, Key: playerKeys.ledger(p, requestId, "debit#timber") }));
      expect(ledger.Item?.["delta"]).toBe(made ? -20 : undefined);
    }
  });

  it("refuses a hero the player does not have", async () => {
    const p = player();
    const other = player();
    const theirs = must((await putCamp(other, ["ALIVE"]))[0], "their hero");
    expect(await refusal(retireHero(repo, p, theirs.id))).toBe("NOT_FOUND");
    expect(await refusal(retireHero(repo, p, randomUUID()))).toBe("NOT_FOUND");
    expect((await repo.getHero(other, theirs.id))?.status).toBe("ALIVE");
  });
});
