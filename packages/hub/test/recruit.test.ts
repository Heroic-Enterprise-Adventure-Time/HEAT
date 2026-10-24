import { randomUUID } from "node:crypto";
import { GetCommand, PutCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { GraphQLError } from "graphql";
import { beforeAll, describe, expect, it } from "vitest";
import { SPRITE_SETS, SPRITE_SET_PRESENTATION, heroNames, must } from "@heat/engine";
import { configFromEnv, createDocumentClient, type Tables } from "../src/db/client.js";
import { playerKeys } from "../src/db/keys.js";
import { InsufficientBalance, RecruitRefused, Repository, type Hero } from "../src/db/repository.js";
import { recruitHero } from "../src/recruit.js";

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

/** A camp in a given state, as the transactions that kill heroes will leave it. */
async function putCamp(p: string, activeHeroes: number, livingHeroes: number) {
  await db.send(
    new PutCommand({
      TableName: tables.player,
      Item: { ...playerKeys.camp(p, at), location: at, hallLevel: 1, warehouseLevel: 1, activeHeroes, livingHeroes },
    }),
  );
}

/** The code of a GraphQLError, which is how the hub refuses; anything else is rethrown. */
function codeOf(e: unknown): string {
  if (e instanceof GraphQLError) return e.extensions["code"] as string;
  throw e;
}

async function refusal(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (e) {
    return codeOf(e);
  }
  return undefined;
}

describe("recruitHero: the free villager", () => {
  it("gives a new player a villager drawn by the hub, and counts it into the camp", async () => {
    const p = player();
    const requestId = randomUUID();
    const hero = await recruitHero(repo, p, "villager", requestId);
    expect(hero).toMatchObject({ id: requestId, location: at, unitType: "villager", level: 1, xp: 0, status: "ALIVE" });
    expect(SPRITE_SETS.villager).toContain(hero.spriteSet);
    expect(heroNames(SPRITE_SET_PRESENTATION[hero.spriteSet] ?? "either")).toContain(hero.name);
    expect(await repo.heroes(p)).toEqual([hero]);
    expect(await repo.camp(p, at)).toMatchObject({ activeHeroes: 1, livingHeroes: 1, hallLevel: 1, stored: true });
  });

  it("charges for a second villager while a hero is alive, and refuses it without the timber", async () => {
    const p = player();
    await recruitHero(repo, p, "villager", randomUUID());
    expect(await refusal(recruitHero(repo, p, "villager", randomUUID()))).toBe("INSUFFICIENT_RESOURCES");
    expect((await repo.heroes(p)).length).toBe(1);
    expect(await repo.camp(p, at)).toMatchObject({ activeHeroes: 1, livingHeroes: 1 });
  });

  it("answers a repeated request with the hero it already made", async () => {
    const p = player();
    const requestId = randomUUID();
    const first = await recruitHero(repo, p, "villager", requestId);
    expect(await recruitHero(repo, p, "villager", requestId)).toEqual(first);
    expect(await repo.camp(p, at)).toMatchObject({ activeHeroes: 1, livingHeroes: 1 });
  });

  it("lets exactly one of five concurrent recruits win", async () => {
    const p = player();
    const results = await Promise.allSettled([1, 2, 3, 4, 5].map(() => recruitHero(repo, p, "villager", randomUUID())));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await repo.heroes(p)).length).toBe(1);
    expect(await repo.camp(p, at)).toMatchObject({ activeHeroes: 1, livingHeroes: 1 });
  });

  it("makes one hero from three concurrent repeats of one request", async () => {
    const p = player();
    const requestId = randomUUID();
    const results = await Promise.all([1, 2, 3].map(() => recruitHero(repo, p, "villager", requestId)));
    expect(new Set(results.map((h) => h.id))).toEqual(new Set([requestId]));
    expect((await repo.heroes(p)).length).toBe(1);
    expect(await repo.camp(p, at)).toMatchObject({ activeHeroes: 1, livingHeroes: 1 });
  });

  it("draws the name to suit the sprite set it drew", async () => {
    // The first draw picks the set, the second the name.
    const draws = (set: string) => {
      const values = [SPRITE_SETS.villager.indexOf(set), 0];
      return (max: number) => Math.min(values.shift() ?? 0, max - 1);
    };
    const man = await recruitHero(repo, player(), "villager", randomUUID(), draws("villager-08"));
    expect(man).toMatchObject({ spriteSet: "villager-08", name: heroNames("masculine")[0] });
    const woman = await recruitHero(repo, player(), "villager", randomUUID(), draws("villager-07"));
    expect(woman).toMatchObject({ spriteSet: "villager-07", name: heroNames("feminine")[0] });
  });

  it("is free again in a camp of dead heroes with a free slot", async () => {
    const p = player();
    await putCamp(p, 2, 0);
    await recruitHero(repo, p, "villager", randomUUID());
    expect(await repo.camp(p, at)).toMatchObject({ activeHeroes: 3, livingHeroes: 1 });
  });

  it("refuses when the hall is full of dead heroes", async () => {
    const p = player();
    await putCamp(p, 4, 0);
    expect(await refusal(recruitHero(repo, p, "villager", randomUUID()))).toBe("HALL_FULL");
    expect(await repo.heroes(p)).toEqual([]);
  });

  it("holds the rules in the transaction, against a camp read before another recruit", async () => {
    const p = player();
    await putCamp(p, 0, 0);
    const stale = await repo.camp(p, at);
    await recruitHero(repo, p, "villager", randomUUID());
    const hero: Hero = {
      id: randomUUID(), location: at, unitType: "villager", spriteSet: "villager-01", name: "Wren",
      recruitedAt: new Date().toISOString(), level: 1, xp: 0, picks: [], status: "ALIVE", retiredAt: null, adventureId: null,
    };
    await expect(repo.recruit(p, stale, 4, hero, [], "none")).rejects.toBeInstanceOf(RecruitRefused);
    expect((await repo.heroes(p)).length).toBe(1);
  });

  it("refuses a fighter with no ore, an unknown unit type and a request id that is not a UUID", async () => {
    const p = player();
    expect(await refusal(recruitHero(repo, p, "fighter", randomUUID()))).toBe("INSUFFICIENT_RESOURCES");
    expect(await refusal(recruitHero(repo, p, "dragon", randomUUID()))).toBe("BAD_USER_INPUT");
    expect(await refusal(recruitHero(repo, p, "villager", "not-a-uuid"))).toBe("BAD_USER_INPUT");
    expect(await repo.heroes(p)).toEqual([]);
  });
});

/** A camp with living heroes and holdings, as recruits and settlements leave it. */
async function putPaidCamp(p: string, livingHeroes: number, holdings: Record<string, number>) {
  await putCamp(p, livingHeroes, livingHeroes);
  for (const [material, balance] of Object.entries(holdings)) await repo.setBalance(p, at, material, balance);
}

const wren = (): Hero => ({
  id: randomUUID(), location: at, unitType: "villager", spriteSet: "villager-01", name: "Wren",
  recruitedAt: new Date().toISOString(), level: 1, xp: 0, picks: [], status: "ALIVE", retiredAt: null, adventureId: null,
});

async function ledgerDelta(p: string, heroId: string, material: string): Promise<number | undefined> {
  const r = await db.send(new GetCommand({ TableName: tables.player, Key: playerKeys.ledger(p, heroId, `debit#${material}`) }));
  return r.Item?.["delta"] as number | undefined;
}

async function shortOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof GraphQLError) return e.extensions["short"];
    throw e;
  }
  return undefined;
}

const byMaterial = (holdings: { material: string; balance: number }[]) => [...holdings].sort((a, b) => a.material.localeCompare(b.material));

describe("recruitHero: paid", () => {
  it("recruits a villager for 20 timber while a hero is alive, with one debit and one ledger entry", async () => {
    const p = player();
    await putPaidCamp(p, 1, { timber: 35 });
    const requestId = randomUUID();
    const hero = await recruitHero(repo, p, "villager", requestId);
    expect(hero).toMatchObject({ id: requestId, unitType: "villager", status: "ALIVE" });
    expect(await repo.holdings(p, at)).toEqual([{ material: "timber", balance: 15 }]);
    expect(await ledgerDelta(p, requestId, "timber")).toBe(-20);
    expect(await repo.camp(p, at)).toMatchObject({ activeHeroes: 2, livingHeroes: 2 });
  });

  it("recruits a fighter for 40 ore, put into the holdings directly since no job yields ore yet", async () => {
    const p = player();
    await putPaidCamp(p, 1, { ore: 40, timber: 10 });
    const requestId = randomUUID();
    const hero = await recruitHero(repo, p, "fighter", requestId);
    expect(hero.unitType).toBe("fighter");
    expect(SPRITE_SETS.fighter).toContain(hero.spriteSet);
    expect(byMaterial(await repo.holdings(p, at))).toEqual([
      { material: "ore", balance: 0 },
      { material: "timber", balance: 10 },
    ]);
    expect(await ledgerDelta(p, requestId, "ore")).toBe(-40);
    expect(await ledgerDelta(p, requestId, "timber")).toBeUndefined();
    expect(await repo.camp(p, at)).toMatchObject({ activeHeroes: 2, livingHeroes: 2 });
  });

  it("charges a fighter even when no hero is alive: only the villager is free", async () => {
    const p = player();
    expect(await shortOf(recruitHero(repo, p, "fighter", randomUUID()))).toEqual([{ material: "ore", amount: 40, balance: 0 }]);
    await putPaidCamp(p, 0, { ore: 40 });
    await recruitHero(repo, p, "fighter", randomUUID());
    expect(await repo.holdings(p, at)).toEqual([{ material: "ore", balance: 0 }]);
  });

  it("says what is short when the camp cannot pay, and debits nothing", async () => {
    const p = player();
    await putPaidCamp(p, 1, { timber: 19 });
    expect(await shortOf(recruitHero(repo, p, "villager", randomUUID()))).toEqual([{ material: "timber", amount: 20, balance: 19 }]);
    expect(await repo.holdings(p, at)).toEqual([{ material: "timber", balance: 19 }]);
    expect(await repo.heroes(p)).toEqual([]);
  });

  it("debits once for three concurrent repeats of one paid request", async () => {
    const p = player();
    await putPaidCamp(p, 1, { timber: 60 });
    const requestId = randomUUID();
    const results = await Promise.all([1, 2, 3].map(() => recruitHero(repo, p, "villager", requestId)));
    expect(new Set(results.map((h) => h.id))).toEqual(new Set([requestId]));
    expect(await repo.holdings(p, at)).toEqual([{ material: "timber", balance: 40 }]);
    expect(await repo.camp(p, at)).toMatchObject({ activeHeroes: 2, livingHeroes: 2 });
  });

  it("gives the last slot to one of two concurrent paid recruits, and tells the other the hall is full", async () => {
    for (let round = 0; round < 5; round++) {
      const p = player();
      await putPaidCamp(p, 3, { timber: 100 });
      const results = await Promise.allSettled([1, 2].map(() => recruitHero(repo, p, "villager", randomUUID())));
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const lost = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(codeOf(must(lost, "the refused recruit").reason)).toBe("HALL_FULL");
      expect(await repo.holdings(p, at)).toEqual([{ material: "timber", balance: 80 }]);
      expect(await repo.camp(p, at)).toMatchObject({ activeHeroes: 4, livingHeroes: 4 });
    }
  });

  it("pays for one of two concurrent recruits with timber for one, and tells the other what is short", async () => {
    for (let round = 0; round < 5; round++) {
      const p = player();
      await putPaidCamp(p, 1, { timber: 30 });
      const results = await Promise.allSettled([1, 2].map(() => recruitHero(repo, p, "villager", randomUUID())));
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const lost = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(codeOf(must(lost, "the refused recruit").reason)).toBe("INSUFFICIENT_RESOURCES");
      expect(await repo.holdings(p, at)).toEqual([{ material: "timber", balance: 10 }]);
      expect(await repo.camp(p, at)).toMatchObject({ activeHeroes: 2, livingHeroes: 2 });
    }
  });

  it("holds the price in the transaction: a villager read as free is refused once a hero lives", async () => {
    const p = player();
    await putPaidCamp(p, 0, { timber: 100 });
    const stale = await repo.camp(p, at);
    await recruitHero(repo, p, "villager", randomUUID());
    await expect(repo.recruit(p, stale, 4, wren(), [], "none")).rejects.toBeInstanceOf(RecruitRefused);
    expect(await repo.holdings(p, at)).toEqual([{ material: "timber", balance: 100 }]);
  });

  it("holds the balance in the transaction, against holdings read before another debit", async () => {
    const p = player();
    await putPaidCamp(p, 1, { timber: 20 });
    await recruitHero(repo, p, "villager", randomUUID());
    const hero = wren();
    const camp = await repo.camp(p, at);
    await expect(repo.recruit(p, camp, 4, hero, [{ material: "timber", amount: 20 }], "some")).rejects.toBeInstanceOf(InsufficientBalance);
    expect(await repo.holdings(p, at)).toEqual([{ material: "timber", balance: 0 }]);
    expect(await ledgerDelta(p, hero.id, "timber")).toBeUndefined();
    expect(await repo.camp(p, at)).toMatchObject({ activeHeroes: 2, livingHeroes: 2 });
  });
});
