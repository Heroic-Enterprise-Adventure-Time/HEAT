import { randomUUID } from "node:crypto";
import { GetCommand, PutCommand, QueryCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { GraphQLError } from "graphql";
import { beforeAll, describe, expect, it } from "vitest";
import { configFromEnv, createDocumentClient, type Tables } from "../src/db/client.js";
import { playerKeys } from "../src/db/keys.js";
import { BuildRefused, InsufficientBalance, RecruitRefused, Repository, campLevels, type Hero } from "../src/db/repository.js";
import { buildFacility } from "../src/build.js";
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

/** Puts stock into the camp directly, as settlement would credit it. */
async function stock(p: string, holdings: Record<string, number>) {
  for (const [material, balance] of Object.entries(holdings)) await repo.setBalance(p, at, material, balance);
}

async function balances(p: string): Promise<Record<string, number>> {
  return Object.fromEntries((await repo.holdings(p, at)).map((h) => [h.material, h.balance]));
}

async function ledger(p: string): Promise<Record<string, unknown>[]> {
  const r = await db.send(
    new QueryCommand({
      TableName: tables.player,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": `PLAYER#${p}`, ":sk": "LEDGER#build-" },
    }),
  );
  return r.Items ?? [];
}

async function refusal(promise: Promise<unknown>): Promise<{ code: string; extensions: Record<string, unknown> } | undefined> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof GraphQLError) return { code: e.extensions["code"] as string, extensions: e.extensions };
    throw e;
  }
  return undefined;
}

describe("buildFacility: the mine", () => {
  it("builds the mine for one timber run's 60 timber and 3 cloth, with one ledger entry per resource", async () => {
    const p = player();
    await stock(p, { timber: 60, cloth: 3 });
    const camp = await buildFacility(repo, p, at, "mine", 1);
    expect(camp.facilities).toEqual({ mine: 1 });
    expect(await balances(p)).toEqual({ timber: 0, cloth: 0 });
    const item = await db.send(new GetCommand({ TableName: tables.player, Key: playerKeys.facility(p, at, "mine") }));
    expect(item.Item).toMatchObject({ SK: `AT#${at}#FACILITY#mine`, location: at, kind: "mine", level: 1 });
    expect((await ledger(p)).map((e) => [e["SK"], e["delta"]]).sort()).toEqual([
      [`LEDGER#build-${at}-mine-1#debit#cloth`, -3],
      [`LEDGER#build-${at}-mine-1#debit#timber`, -60],
    ]);
  });

  it("says what is short when the camp cannot pay, and builds and debits nothing", async () => {
    const p = player();
    await stock(p, { timber: 60 });
    const r = await refusal(buildFacility(repo, p, at, "mine", 1));
    expect(r?.code).toBe("INSUFFICIENT_RESOURCES");
    expect(r?.extensions["short"]).toEqual([{ material: "cloth", amount: 3, balance: 0 }]);
    expect((await repo.camp(p, at)).facilities).toEqual({});
    expect(await balances(p)).toEqual({ timber: 60 });
  });

  it("answers a repeated request with the camp, charging once", async () => {
    const p = player();
    await stock(p, { timber: 120, cloth: 6 });
    await buildFacility(repo, p, at, "mine", 1);
    const again = await buildFacility(repo, p, at, "mine", 1);
    expect(again.facilities).toEqual({ mine: 1 });
    expect(await balances(p)).toEqual({ timber: 60, cloth: 3 });
  });

  it("refuses the mine's second level, which this location does not offer", async () => {
    const p = player();
    await stock(p, { timber: 60, cloth: 3 });
    await buildFacility(repo, p, at, "mine", 1);
    expect((await refusal(buildFacility(repo, p, at, "mine", 2)))?.code).toBe("MAX_LEVEL");
  });

  it("builds once and charges once for five concurrent requests", async () => {
    const p = player();
    await stock(p, { timber: 100, cloth: 10 });
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => buildFacility(repo, p, at, "mine", 1)));
    // Every request is answered with the built mine: the losers find it built when they read again.
    expect(results.every((r) => r.status === "fulfilled" && r.value.facilities.mine === 1)).toBe(true);
    expect(await balances(p)).toEqual({ timber: 40, cloth: 7 });
    expect(await ledger(p)).toHaveLength(2);
  });

  it("gives the timber of one build to one of two concurrent builds, and tells the other what is short", async () => {
    const p = player();
    await stock(p, { timber: 60, cloth: 3, ore: 20 });
    const results = await Promise.allSettled([buildFacility(repo, p, at, "mine", 1), buildFacility(repo, p, at, "lumber-camp", 1)]);
    const built = results.filter((r) => r.status === "fulfilled");
    expect(built).toHaveLength(1);
    const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((lost.reason as GraphQLError).extensions["code"]).toBe("INSUFFICIENT_RESOURCES");
    expect((await balances(p))["timber"]).toBeGreaterThanOrEqual(0);
    expect(Object.keys((await repo.camp(p, at)).facilities)).toHaveLength(1);
  });

  it("holds the level in the transaction, against a camp read before another build", async () => {
    const p = player();
    await stock(p, { timber: 120, cloth: 6 });
    const stale = await repo.camp(p, at);
    await buildFacility(repo, p, at, "mine", 1);
    await expect(repo.build(p, stale, { kind: "mine", from: 0, cost: [{ material: "timber", amount: 60 }], requires: [] })).rejects.toBeInstanceOf(BuildRefused);
    expect(await balances(p)).toEqual({ timber: 60, cloth: 3 });
  });

  it("holds the balance in the transaction, against holdings read before another debit", async () => {
    const p = player();
    await stock(p, { timber: 60, cloth: 3 });
    const camp = await repo.camp(p, at);
    await repo.debit(p, at, "elsewhere", "timber", 10);
    await expect(repo.build(p, camp, { kind: "mine", from: 0, cost: [{ material: "timber", amount: 60 }, { material: "cloth", amount: 3 }], requires: [] })).rejects.toBeInstanceOf(InsufficientBalance);
    expect((await repo.camp(p, at)).facilities).toEqual({});
  });

  it("refuses an unknown facility, a shared one, an unknown camp and a level that is not the next", async () => {
    const p = player();
    expect((await refusal(buildFacility(repo, p, at, "castle", 1)))?.code).toBe("BAD_USER_INPUT");
    expect((await refusal(buildFacility(repo, p, at, "job-board", 1)))?.code).toBe("BAD_USER_INPUT");
    expect((await refusal(buildFacility(repo, p, "atlantis", "mine", 1)))?.code).toBe("BAD_USER_INPUT");
    expect((await refusal(buildFacility(repo, p, at, "heroes-hall", 3)))?.code).toBe("BAD_USER_INPUT");
  });
});

describe("buildFacility: the hall and the warehouse", () => {
  it("upgrades the hall of a camp with no item yet, creating it at level 1 for everything else", async () => {
    const p = player();
    await stock(p, { timber: 80, cloth: 20 });
    const camp = await buildFacility(repo, p, at, "heroes-hall", 2);
    expect(camp).toMatchObject({ hallLevel: 2, warehouseLevel: 1, activeHeroes: 0, livingHeroes: 0, stored: true });
    expect(await balances(p)).toEqual({ timber: 0, cloth: 0 });
  });

  it("raises the hall's cap: a level-2 hall takes a fifth and sixth hero", async () => {
    const p = player();
    await db.send(
      new PutCommand({
        TableName: tables.player,
        Item: { ...playerKeys.camp(p, at), location: at, hallLevel: 1, warehouseLevel: 1, activeHeroes: 4, livingHeroes: 0 },
      }),
    );
    expect((await refusal(recruitHero(repo, p, "villager", randomUUID())))?.code).toBe("HALL_FULL");
    await stock(p, { timber: 80, cloth: 20 });
    await buildFacility(repo, p, at, "heroes-hall", 2);
    await recruitHero(repo, p, "villager", randomUUID());
    expect(await repo.camp(p, at)).toMatchObject({ hallLevel: 2, activeHeroes: 5, livingHeroes: 1 });
  });

  it("upgrades a stored camp's warehouse, keeping its heroes", async () => {
    const p = player();
    await recruitHero(repo, p, "villager", randomUUID());
    await stock(p, { timber: 80, ore: 40 });
    const camp = await buildFacility(repo, p, at, "warehouse", 2);
    expect(camp).toMatchObject({ hallLevel: 1, warehouseLevel: 2, activeHeroes: 1, livingHeroes: 1 });
    expect(campLevels(camp)).toMatchObject({ "heroes-hall": 1, warehouse: 2 });
  });

  it("fails a recruit that read the hall before an upgrade, and the recruit then succeeds on a read again", async () => {
    const p = player();
    await recruitHero(repo, p, "villager", randomUUID());
    const stale = await repo.camp(p, at);
    await stock(p, { timber: 80, cloth: 20 });
    await buildFacility(repo, p, at, "heroes-hall", 2);
    const hero: Hero = {
      id: randomUUID(), location: at, unitType: "villager", spriteSet: "villager-01", name: "Wren",
      recruitedAt: new Date().toISOString(), level: 1, xp: 0, picks: [], status: "ALIVE", retiredAt: null, adventureId: null,
    };
    await expect(repo.recruit(p, stale, 4, hero, [], "any")).rejects.toBeInstanceOf(RecruitRefused);
  });

  it("upgrades the hall once for two concurrent requests", async () => {
    const p = player();
    await recruitHero(repo, p, "villager", randomUUID());
    await stock(p, { timber: 200, cloth: 50 });
    await Promise.all([buildFacility(repo, p, at, "heroes-hall", 2), buildFacility(repo, p, at, "heroes-hall", 2)]);
    expect((await repo.camp(p, at)).hallLevel).toBe(2);
    expect(await balances(p)).toEqual({ timber: 120, cloth: 30 });
  });
});

describe("buildFacility: what a level needs first", () => {
  it("refuses the caravan hub until the warehouse is at level 2, then builds it", async () => {
    const p = player();
    await stock(p, { timber: 100, ore: 100, cloth: 20 });
    const r = await refusal(buildFacility(repo, p, at, "caravan-hub", 1));
    expect(r?.code).toBe("REQUIRES");
    expect(r?.extensions["missing"]).toEqual([{ kind: "warehouse", level: 2 }]);
    expect(await balances(p)).toEqual({ timber: 100, ore: 100, cloth: 20 });

    await stock(p, { timber: 180, ore: 100, cloth: 20 });
    await buildFacility(repo, p, at, "warehouse", 2);
    const camp = await buildFacility(repo, p, at, "caravan-hub", 1);
    expect(camp.facilities).toEqual({ "caravan-hub": 1 });
    expect(await balances(p)).toEqual({ timber: 0, ore: 0, cloth: 0 });
  });

  it("holds the requirement in the transaction, against a camp read as if the warehouse were built", async () => {
    const p = player();
    await recruitHero(repo, p, "villager", randomUUID());
    await stock(p, { timber: 100, ore: 60, cloth: 20 });
    const camp = await repo.camp(p, at);
    const build = { kind: "caravan-hub" as const, from: 0, cost: [{ material: "timber" as const, amount: 100 }], requires: [{ kind: "warehouse" as const, level: 2 }] };
    await expect(repo.build(p, camp, build)).rejects.toBeInstanceOf(BuildRefused);
    expect((await balances(p))["timber"]).toBe(100);
  });
});
