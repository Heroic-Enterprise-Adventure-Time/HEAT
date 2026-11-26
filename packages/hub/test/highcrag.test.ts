import { randomUUID } from "node:crypto";

import { type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { range } from "es-toolkit";
import { beforeAll, describe, expect, it } from "vitest";

import { type AdventureResult, type AdventureSnapshot, jobsPostedBy, location, LOCATIONS, must, replay, STARTING_LOCATION, UNIT_PROFILES, type UnitType } from "@heat/engine";

import { configFromEnv, createDocumentClient, type Tables } from "../src/db/client.js";
import { type Hero, Repository } from "../src/db/repository.js";
import { recruitHero } from "../src/recruit.js";
import { InsufficientResources, Requires } from "../src/refusals.js";
import { startAdventure } from "../src/start.js";
import { submitAdventure } from "../src/submit.js";
import { MemoryTimelines } from "../src/timelines.js";
import { balances, build, player, putParty, putUnlock, stock } from "./data.js";
import { refusal } from "./refusal.js";
import { VERSION as version } from "./versions.js";

/**
 * Highcrag's own content against DynamoDB Local (Issue-356, decision 0059),
 * through the verbs with the engine's content: the knight recruited at
 * Highcrag and refused there for want of hide, the quarry's job refused until
 * the quarry is built and then bringing stone home, and a caravan from
 * Highcrag's hub delivering stone to Millbrook.
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

const highcrag = must(LOCATIONS.find((l) => l.unlock !== undefined), "a location that needs an unlock");
const road = must(highcrag.unlock, "its unlock");
const knight = must(highcrag.recruits.find((r) => r.unitType === "knight"), "Highcrag's knight");
const face = must(jobsPostedBy(highcrag.id, "quarry")[0], "the quarry's first job");
const back = must(jobsPostedBy(highcrag.id, "caravan-hub")[0], "Highcrag's caravan");

/** A player who holds the road, with heroes of these types at Highcrag and this stock there. */
async function camped(unitTypes: readonly UnitType[], holdings: Parameters<typeof stock>[3] = {}): Promise<{ p: string; heroes: Hero[] }> {
  const p = player();
  await putUnlock(db, tables.player, p, road);
  const heroes = await putParty(db, tables, p, unitTypes, highcrag.id);
  await stock(repo, p, highcrag.id, holdings);
  return { p, heroes };
}

/**
 * A seed on which a party of these unit types ends `jobId` as `ends` says,
 * found by asking the engine (graphql.md, rule 26): a roll does not read who
 * the heroes are, so a stand-in party of the same types says what the
 * player's will do.
 */
function seedFor(jobId: string, unitTypes: readonly UnitType[], ends: (result: AdventureResult) => boolean): string {
  const standIn: AdventureSnapshot = {
    version,
    jobId,
    heroes: unitTypes.map((unitType, i) => ({ heroId: `stand-in-${i}`, unitType, name: unitType, spriteSet: `${unitType}-01`, level: 1, stats: must(UNIT_PROFILES[unitType], `the ${unitType}'s profile`).stats })),
  };
  return must(range(500).map((i) => `${jobId}-${i}`).find((seed) => ends(replay(standIn, seed, []).result)), `a seed on which ${unitTypes.join(" and ")} end so`);
}

const ids = (heroes: readonly Hero[]) => heroes.map((h) => h.id);
const whole = (r: AdventureResult) => r.outcome === "complete" && r.dead.length === 0;

describe("the knight at Highcrag", () => {
  it("is recruited for its ore and hide, which are debited, and counted into Highcrag's camp", async () => {
    const holdings = Object.fromEntries(knight.cost.map((c) => [c.material, c.amount]));
    const { p } = await camped([], holdings);
    const hero = await recruitHero(repo, p, highcrag.id, "knight", randomUUID());
    expect(hero).toMatchObject({ location: highcrag.id, recruitedIn: highcrag.id, unitType: "knight", status: "ALIVE" });
    expect(await balances(repo, p, highcrag.id)).toEqual(Object.fromEntries(knight.cost.map((c) => [c.material, 0])));
    expect(await repo.camp(p, highcrag.id)).toMatchObject({ activeHeroes: 1, livingHeroes: 1 });
  });

  it("is refused for want of hide, saying what is short, with the ore left where it was", async () => {
    const ore = must(knight.cost.find((c) => c.material === "ore"), "the knight's ore").amount;
    const hide = must(knight.cost.find((c) => c.material === "hide"), "the knight's hide").amount;
    const { p } = await camped([], { ore });
    const refused = await refusal(recruitHero(repo, p, highcrag.id, "knight", randomUUID()));
    expect(refused).toBeInstanceOf(InsufficientResources);
    expect(refused).toMatchObject({ short: [{ material: "hide", amount: hide, balance: 0 }] });
    expect(await balances(repo, p, highcrag.id)).toEqual({ ore });
    expect(await repo.heroes(p)).toEqual([]);
  });

  it("is not recruited at Millbrook, which does not offer it", () => {
    expect(location(STARTING_LOCATION)?.recruits.map((r) => r.unitType)).not.toContain("knight");
  });
});

describe("the quarry's job", () => {
  it("is refused until the quarry is built, and once it is, brings the stone the engine rolls home to Highcrag", async () => {
    const { p, heroes } = await camped(["miner"]);
    const seed = seedFor(face.id, ["miner"], whole);
    const begin = () => startAdventure(repo, p, version, randomUUID(), highcrag.id, face.id, ids(heroes), undefined, undefined, () => seed);
    const refused = await refusal(begin());
    expect(refused).toBeInstanceOf(Requires);
    expect(refused).toMatchObject({ missing: [{ kind: "quarry", level: 1 }] });
    expect(await repo.openAdventure(p)).toBeUndefined();

    await build(repo, p, highcrag.id, "quarry");
    const before = await balances(repo, p, highcrag.id);
    const started = await begin();
    const expected = replay(started.snapshot, started.seed, []).result;
    const stone = must(expected.rewards.find((r) => r.material === "stone"), "the stone the engine rolls").amount;
    expect(stone).toBeGreaterThan(0);
    const settled = await submitAdventure(repo, new MemoryTimelines(), p, version, started.adventureId, []);
    expect(settled.result).toMatchObject({ outcome: "complete" });
    expect(await balances(repo, p, highcrag.id)).toEqual({ ...before, stone });
  });
});

describe("a caravan from Highcrag to Millbrook", () => {
  it("is started from Highcrag's hub with stone as its cargo and settled with the stone delivered to Millbrook", async () => {
    const party: UnitType[] = ["miner", "knight"];
    const { p, heroes } = await camped(party);
    const destination = must(back.deliversTo, "the caravan's destination");
    expect(destination).toBe(STARTING_LOCATION);
    await build(repo, p, highcrag.id, "caravan-hub");
    await stock(repo, p, highcrag.id, { stone: 40 });
    const atHome = await balances(repo, p, destination);

    const seed = seedFor(back.id, party, (r) => whole(r) && r.delivered === true);
    const started = await startAdventure(repo, p, version, randomUUID(), highcrag.id, back.id, ids(heroes), { cargo: [{ material: "stone", amount: 40 }], staying: [] }, undefined, () => seed);
    expect(started.caravan).toEqual({ destination, cargo: [{ material: "stone", amount: 40 }], staying: [] });
    expect((await balances(repo, p, highcrag.id))["stone"]).toBe(0);

    const settled = await submitAdventure(repo, new MemoryTimelines(), p, version, started.adventureId, []);
    expect(settled.result).toMatchObject({ outcome: "complete", delivered: [{ material: "stone", amount: 40 }] });
    expect((await balances(repo, p, destination))["stone"]).toBe((atHome["stone"] ?? 0) + 40);
    for (const hero of heroes) expect(await repo.getHero(p, hero.id)).toMatchObject({ location: highcrag.id, status: "ALIVE", adventureId: null });
  });
});
