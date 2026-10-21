import { randomUUID } from "node:crypto";
import { PutCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { GraphQLError } from "graphql";
import { beforeAll, describe, expect, it } from "vitest";
import { SPRITE_SETS, SPRITE_SET_PRESENTATION, heroNames } from "@heat/engine";
import { configFromEnv, createDocumentClient, type Tables } from "../src/db/client.js";
import { playerKeys } from "../src/db/keys.js";
import { RecruitRefused, Repository, type Hero } from "../src/db/repository.js";
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

async function refusal(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof GraphQLError) return e.extensions["code"] as string;
    throw e;
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

  it("refuses a second free villager while a hero is alive", async () => {
    const p = player();
    await recruitHero(repo, p, "villager", randomUUID());
    expect(await refusal(recruitHero(repo, p, "villager", randomUUID()))).toBe("NOT_FREE");
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
      recruitedAt: new Date().toISOString(), level: 1, xp: 0, picks: [], status: "ALIVE",
    };
    await expect(repo.recruitFree(p, stale, 4, hero)).rejects.toBeInstanceOf(RecruitRefused);
    expect((await repo.heroes(p)).length).toBe(1);
  });

  it("refuses the fighter, which costs resources, an unknown unit type and a request id that is not a UUID", async () => {
    const p = player();
    expect(await refusal(recruitHero(repo, p, "fighter", randomUUID()))).toBe("NOT_AVAILABLE");
    expect(await refusal(recruitHero(repo, p, "dragon", randomUUID()))).toBe("BAD_USER_INPUT");
    expect(await refusal(recruitHero(repo, p, "villager", "not-a-uuid"))).toBe("BAD_USER_INPUT");
    expect(await repo.heroes(p)).toEqual([]);
  });
});
