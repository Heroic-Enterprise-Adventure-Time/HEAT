import { randomUUID } from "node:crypto";

import { type DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { range } from "es-toolkit";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  ADVENTURE_CONTENT,
  type AdventureContent,
  type AdventureResult,
  type AdventureSnapshot,
  CART_CAPACITY,
  hallCapacity,
  hubLevelCarrying,
  type Job,
  JOBS,
  location,
  type Material,
  MATERIALS,
  must,
  replay,
  type Reward,
  STARTING_LOCATION,
  type UnitType,
} from "@heat/engine";

import { configFromEnv, createDocumentClient, type Tables } from "../src/db/client.js";
import { type Camp, FacilityMissing, type Hero, LocationLocked, Repository } from "../src/db/repository.js";
import { discardAdventure } from "../src/discard.js";
import { readAdventure } from "../src/read.js";
import { recruitHero } from "../src/recruit.js";
import { AdventureOpen, Conflict, HallFull, InsufficientResources } from "../src/refusals.js";
import { type CaravanRequest, startAdventure } from "../src/start.js";
import { type OverrideInput, submitAdventure } from "../src/submit.js";
import { MemoryTimelines, type Timelines } from "../src/timelines.js";
import { balances, build, player, putParty, putUnlock, stock, storedItem } from "./data.js";
import { locationKeys, playerKeys } from "./keys.js";
import { everyInterleaving, winnerBefore } from "./race.js";
import { BAD_USER_INPUT, refusal } from "./refusal.js";
import { seedWhere, standIn } from "./seeds.js";
import { VERSION as version } from "./versions.js";

/**
 * Caravans against DynamoDB Local (Issue-354, decision 0059): "Caravan to
 * Highcrag", started, settled and discarded through the verbs with the
 * engine's content. Each row of the issue's settle table; the start's
 * refusals, by the read and by the transaction; the races for a balance and
 * for the destination's last slot; a submit repeated and raced, delivering
 * once; the destination's cap; a resource both dropped and delivered; a
 * discard's return; a hero who lands dead; the cargo of an open caravan; the
 * largest settlement's items against DynamoDB's 100; and a recruit repeated
 * after its hero moved.
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

const home = STARTING_LOCATION;
const caravan = JOBS["caravan-to-highcrag"];
const there = must(caravan.deliversTo, "the caravan's destination");
const road = must(location(there)?.unlock, "the destination's unlock");
const hub = must(caravan.facility, "the facility that posts the caravan");

const snapshotOf = (unitTypes: readonly UnitType[]): AdventureSnapshot => standIn(caravan.id, unitTypes);

/** A seed on which a party of these unit types ends the caravan as `ends` says. */
const seedFor = (unitTypes: readonly UnitType[], ends: (result: AdventureResult) => boolean, content?: AdventureContent): string => seedWhere(caravan.id, unitTypes, ends, content);

const deliveredWhole = (r: AdventureResult) => r.outcome === "complete" && r.delivered === true && r.dead.length === 0;

/** A player with a party at Millbrook, the caravan hub built there, the road open and this stock at Millbrook. */
async function ready(unitTypes: readonly UnitType[], holdings: Partial<Record<Material, number>> = {}): Promise<{ p: string; heroes: Hero[] }> {
  const p = player();
  const heroes = await putParty(db, tables, p, unitTypes, home);
  await build(repo, p, home, hub);
  await putUnlock(db, tables.player, p, road);
  await stock(repo, p, home, holdings);
  return { p, heroes };
}

const ids = (heroes: readonly Hero[]) => heroes.map((h) => h.id);

/** Starts the caravan through the verb, on the seed given. */
function start(r: Repository, p: string, heroes: readonly Hero[], request: CaravanRequest, seed = "caravan-0", requestId: string = randomUUID(), issuedBy = version) {
  return startAdventure(r, p, issuedBy, requestId, home, caravan.id, ids(heroes), request, undefined, () => seed);
}

const submit = (r: Repository, p: string, adventureId: string, overrides: OverrideInput[] = [], timelines: Timelines = new MemoryTimelines(), content: AdventureContent = ADVENTURE_CONTENT) =>
  submitAdventure(r, timelines, p, version, adventureId, overrides, new Date(), content);

const sighting = (at: string, heroId: string) => storedItem(db, tables.location, locationKeys.seen(at, heroId));
const ledger = (p: string, adventureId: string, entry: string) => storedItem(db, tables.player, playerKeys.ledger(p, adventureId, entry));
const counts = async (p: string, at: string) => {
  const { activeHeroes, livingHeroes } = await repo.camp(p, at);
  return { activeHeroes, livingHeroes };
};

const RETREAT: OverrideInput[] = [{ kind: "PARTY", acceptedAtSimTime: 0, order: "RETREAT" }];

describe("a caravan's start", () => {
  it("debits the cargo with a ledger entry for each resource, holds a slot at the destination for each hero who stays, and keeps both on the record", async () => {
    const { p, heroes } = await ready(["fighter", "villager"], { ore: 50, timber: 20 });
    const stays = must(heroes[1], "the villager");
    const cargo: Reward[] = [{ material: "ore", amount: 30 }, { material: "timber", amount: 20 }];
    const started = await start(repo, p, heroes, { cargo, staying: [stays.id] });
    expect(started.caravan).toEqual({ destination: there, cargo, staying: [stays.id] });
    expect((await repo.getAdventure(started.adventureId))?.caravan).toEqual(started.caravan);
    expect(await balances(repo, p, home)).toMatchObject({ ore: 20, timber: 0 });
    expect(await ledger(p, started.adventureId, "load#ore")).toMatchObject({ location: home, material: "ore", delta: -30 });
    expect(await ledger(p, started.adventureId, "load#timber")).toMatchObject({ location: home, material: "timber", delta: -20 });
    expect(await repo.camp(p, there)).toMatchObject({ hallLevel: 1, warehouseLevel: 1, activeHeroes: 1, livingHeroes: 0, stored: true });
  });

  it("is answered with the adventure it started when repeated, and is bad input with another cargo or other heroes who stay", async () => {
    const { p, heroes } = await ready(["fighter", "villager"], { ore: 50 });
    const requestId = randomUUID();
    const request = { cargo: [{ material: "ore" as const, amount: 30 }], staying: [ids(heroes)[1] ?? ""] };
    const started = await start(repo, p, heroes, request, "caravan-0", requestId);
    expect(await start(repo, p, heroes, request, "caravan-0", requestId)).toEqual(started);
    expect(await refusal(start(repo, p, heroes, { ...request, cargo: [{ material: "ore", amount: 31 }] }, "caravan-0", requestId))).toMatchObject(BAD_USER_INPUT);
    expect(await refusal(start(repo, p, heroes, { ...request, staying: [] }, "caravan-0", requestId))).toMatchObject(BAD_USER_INPUT);
    expect(await balances(repo, p, home)).toMatchObject({ ore: 20 });
  });

  it("is bad input for a hero who stays and is not of the party, and for a cargo or a hero who stays on a job that delivers nothing", async () => {
    const { p, heroes } = await ready(["fighter", "villager"], { ore: 50 });
    const [fighter] = heroes;
    expect(await refusal(start(repo, p, [must(fighter, "the fighter")], { cargo: [], staying: [ids(heroes)[1] ?? ""] }))).toMatchObject(BAD_USER_INPUT);
    const wolves = (request: CaravanRequest) => startAdventure(repo, p, version, randomUUID(), home, "wolves-on-the-mill-road", ids(heroes), request);
    expect(await refusal(wolves({ cargo: [{ material: "ore", amount: 1 }], staying: [] }))).toMatchObject(BAD_USER_INPUT);
    expect(await refusal(wolves({ cargo: [], staying: [ids(heroes)[0] ?? ""] }))).toMatchObject(BAD_USER_INPUT);
    expect(await repo.openAdventure(p)).toBeUndefined();
  });
});

describe("a caravan's start refused", () => {
  /** What a refused start leaves: Millbrook's stock as it was, nothing open, and nobody's slot held at the destination. */
  async function untouched(p: string, holdings: Record<string, number>, destination: Partial<Camp> = { activeHeroes: 0 }) {
    expect(await balances(repo, p, home)).toMatchObject(holdings);
    expect(await repo.openAdventure(p)).toBeUndefined();
    expect(await repo.camp(p, there)).toMatchObject(destination);
  }

  it("for a destination the player has not unlocked, by its read, as bad input, before any transaction", async () => {
    const p = player();
    const heroes = await putParty(db, tables, p, ["fighter"], home);
    await build(repo, p, home, hub);
    await stock(repo, p, home, { ore: 50 });
    const transaction = vi.spyOn(Repository.prototype, "startAdventure");
    try {
      expect(await refusal(start(repo, p, heroes, { cargo: [{ material: "ore", amount: 10 }], staying: [] }))).toMatchObject(BAD_USER_INPUT);
      expect(transaction).not.toHaveBeenCalled();
    } finally {
      transaction.mockRestore();
    }
    await untouched(p, { ore: 50 });
  });

  it("for a destination the player has not unlocked, by its transaction when the read is wrong, as bad input naming the destination", async () => {
    const p = player();
    const heroes = await putParty(db, tables, p, ["fighter"], home);
    await build(repo, p, home, hub);
    await stock(repo, p, home, { ore: 50 });
    const trusting = new (class extends Repository {
      override unlocks() {
        return Promise.resolve([{ unlock: road, earnedAt: "2026-11-24T12:00:00.000Z", adventureId: "none" }]);
      }
    })(db, tables);
    const transaction = vi.spyOn(Repository.prototype, "startAdventure");
    try {
      const refused = await refusal(start(trusting, p, heroes, { cargo: [{ material: "ore", amount: 10 }], staying: [] }));
      expect(refused).toMatchObject(BAD_USER_INPUT);
      expect(String(refused)).toContain(there);
      await expect(transaction.mock.results[0]?.value).rejects.toBeInstanceOf(LocationLocked);
    } finally {
      transaction.mockRestore();
    }
    await untouched(p, { ore: 50 });
  });

  it("for a balance short of the cargo, by its read, with each resource it is short of", async () => {
    const { p, heroes } = await ready(["fighter"], { ore: 50, timber: 10 });
    const transaction = vi.spyOn(Repository.prototype, "startAdventure");
    try {
      const refused = await refusal(start(repo, p, heroes, { cargo: [{ material: "ore", amount: 60 }, { material: "timber", amount: 10 }], staying: [] }));
      expect(refused).toBeInstanceOf(InsufficientResources);
      expect(refused).toMatchObject({ short: [{ material: "ore", amount: 60, balance: 50 }] });
      expect(transaction).not.toHaveBeenCalled();
    } finally {
      transaction.mockRestore();
    }
    await untouched(p, { ore: 50, timber: 10 });
  });

  it("for a balance spent between its read and its transaction, at every point a spend can land, and the balance is debited by the spend alone", async () => {
    const races = await everyInterleaving(async (k) => {
      const { p, heroes } = await ready(["fighter"], { ore: 50 });
      const race = winnerBefore(repo, k, () => repo.debit(p, home, randomUUID(), "ore", 30));
      const refused = await refusal(start(race.repo, p, heroes, { cargo: [{ material: "ore", amount: 30 }], staying: [] }));
      if (!race.ran()) return false;
      expect(refused, `k=${k}`).toBeInstanceOf(InsufficientResources);
      await untouched(p, { ore: 20 });
      return true;
    });
    expect(races).toBeGreaterThan(0);
  });

  it("as two starts race for one balance: the cargo is debited once, and the loser is told an adventure is open", async () => {
    const races = await everyInterleaving(async (k) => {
      const { p, heroes } = await ready(["fighter", "fighter"], { ore: 40 });
      const [first, second] = heroes.map((h) => [h]);
      const request: CaravanRequest = { cargo: [{ material: "ore", amount: 30 }], staying: [] };
      let winner: string | undefined;
      const race = winnerBefore(repo, k, async () => (winner = (await start(repo, p, must(first, "a party"), request)).adventureId));
      const refused = await refusal(start(race.repo, p, must(second, "another party"), request));
      if (!race.ran()) return false;
      expect(refused, `k=${k}`).toBeInstanceOf(AdventureOpen);
      expect(refused).toMatchObject({ adventureId: winner });
      expect(await balances(repo, p, home)).toMatchObject({ ore: 10 });
      return true;
    });
    expect(races).toBeGreaterThan(0);
  });

  it("for a destination hall with no room for everyone who stays, by its read, before any transaction", async () => {
    const { p, heroes } = await ready(["fighter", "villager"], { ore: 50 });
    await putParty(db, tables, p, range(hallCapacity(1)).map(() => "miner"), there);
    const transaction = vi.spyOn(Repository.prototype, "startAdventure");
    try {
      expect(await refusal(start(repo, p, heroes, { cargo: [{ material: "ore", amount: 10 }], staying: [ids(heroes)[1] ?? ""] }))).toBeInstanceOf(HallFull);
      expect(transaction).not.toHaveBeenCalled();
    } finally {
      transaction.mockRestore();
    }
    await untouched(p, { ore: 50 }, { activeHeroes: hallCapacity(1) });
  });

  it("for the destination's last slot taken by a recruit there, at every point the recruit can land, and the recruit's hero has the slot", async () => {
    const races = await everyInterleaving(async (k) => {
      const { p, heroes } = await ready(["fighter", "villager"], { ore: 50 });
      await putParty(db, tables, p, range(hallCapacity(1) - 1).map(() => "miner"), there);
      await stock(repo, p, there, { ore: 40 });
      const race = winnerBefore(repo, k, () => recruitHero(repo, p, there, "fighter", randomUUID()));
      const refused = await refusal(start(race.repo, p, heroes, { cargo: [{ material: "ore", amount: 10 }], staying: [ids(heroes)[1] ?? ""] }));
      if (!race.ran()) return false;
      expect(refused, `k=${k}`).toBeInstanceOf(HallFull);
      await untouched(p, { ore: 50 }, { activeHeroes: hallCapacity(1) });
      return true;
    });
    expect(races).toBeGreaterThan(0);
  });

  it("holds the destination's last slot against a recruit there, at every point the start can land, and the recruit is told the hall is full", async () => {
    const races = await everyInterleaving(async (k) => {
      const { p, heroes } = await ready(["fighter", "villager"], { ore: 50 });
      await putParty(db, tables, p, range(hallCapacity(1) - 1).map(() => "miner"), there);
      await stock(repo, p, there, { ore: 40 });
      const race = winnerBefore(repo, k, () => start(repo, p, heroes, { cargo: [{ material: "ore", amount: 10 }], staying: [ids(heroes)[1] ?? ""] }));
      const refused = await refusal(recruitHero(race.repo, p, there, "fighter", randomUUID()));
      if (!race.ran()) return false;
      expect(refused, `k=${k}`).toBeInstanceOf(HallFull);
      expect(await repo.camp(p, there)).toMatchObject({ activeHeroes: hallCapacity(1) });
      expect(await balances(repo, p, there)).toMatchObject({ ore: 40 });
      return true;
    });
    expect(races).toBeGreaterThan(0);
  });

  it("holds the hub's level whose cart carries the cargo in its transaction, which refuses a hub the read wrongly found built", async () => {
    const p = player();
    const heroes = await putParty(db, tables, p, ["fighter"], home);
    await putUnlock(db, tables.player, p, road);
    await stock(repo, p, home, { ore: 100 });
    // A read that finds the hub built where it is not: what is left to hold the cart is the transaction's condition.
    const believing = new (class extends Repository {
      override async camp(playerId: string, at: string): Promise<Camp> {
        const camp = await super.camp(playerId, at);
        return at === home ? { ...camp, facilities: { ...camp.facilities, [hub]: 1 } } : camp;
      }
    })(db, tables);
    const transaction = vi.spyOn(Repository.prototype, "startAdventure");
    try {
      expect(await refusal(start(believing, p, heroes, { cargo: [{ material: "ore", amount: 100 }], staying: [] }))).toBeInstanceOf(Conflict);
      expect(transaction.mock.calls[0]?.[2]).toEqual([{ kind: hub, level: hubLevelCarrying(100) }]);
      await expect(transaction.mock.results[0]?.value).rejects.toBeInstanceOf(FacilityMissing);
    } finally {
      transaction.mockRestore();
    }
    await untouched(p, { ore: 100 });
  });
});

describe("a caravan's settlement", () => {
  it("arriving with the cart standing: the cargo is delivered, the heroes who stay land there and the rest come home", async () => {
    const party: UnitType[] = ["fighter", "villager"];
    const { p, heroes } = await ready(party, { ore: 50, timber: 20 });
    const [fighter, villager] = heroes as [Hero, Hero];
    const cargo: Reward[] = [{ material: "ore", amount: 30 }, { material: "timber", amount: 20 }];
    const started = await start(repo, p, heroes, { cargo, staying: [villager.id] }, seedFor(party, deliveredWhole));
    const settled = await submit(repo, p, started.adventureId);
    expect(settled.result).toMatchObject({ outcome: "complete", delivered: cargo, deliveryLost: [] });
    expect(await balances(repo, p, there)).toEqual({ ore: 30, timber: 20 });
    expect(await ledger(p, started.adventureId, "deliver#ore")).toMatchObject({ location: there, material: "ore", delta: 30, lost: 0 });
    expect(await ledger(p, started.adventureId, "deliver#timber")).toMatchObject({ location: there, material: "timber", delta: 20, lost: 0 });
    expect(await repo.getHero(p, villager.id)).toMatchObject({ location: there, recruitedIn: home, status: "ALIVE", adventureId: null });
    expect(await repo.getHero(p, fighter.id)).toMatchObject({ location: home, recruitedIn: home, status: "ALIVE", adventureId: null });
    expect(await sighting(home, villager.id)).toBeUndefined();
    expect(await sighting(there, villager.id)).toMatchObject({ heroId: villager.id });
    expect(await sighting(home, fighter.id)).toMatchObject({ heroId: fighter.id });
    expect(await counts(p, home)).toEqual({ activeHeroes: 1, livingHeroes: 1 });
    expect(await counts(p, there)).toEqual({ activeHeroes: 1, livingHeroes: 1 });
    // The feed item is the origin's alone (Issue-354, "Not in scope").
    const now = new Date();
    expect((await repo.recentAdventures(home, 20, now)).map((r) => r.adventureId)).toContain(started.adventureId);
    expect((await repo.recentAdventures(there, 20, now)).map((r) => r.adventureId)).not.toContain(started.adventureId);
  });

  it("writes where a hero was recruited, from where it was, when it first moves a hero whose item has none", async () => {
    const party: UnitType[] = ["fighter", "villager"];
    const { p, heroes } = await ready(party);
    const villager = must(heroes[1], "the villager");
    await db.send(new UpdateCommand({ TableName: tables.player, Key: playerKeys.hero(p, villager.id), UpdateExpression: "REMOVE recruitedIn" }));
    expect(await storedItem(db, tables.player, playerKeys.hero(p, villager.id))).not.toHaveProperty("recruitedIn");
    const started = await start(repo, p, heroes, { cargo: [], staying: [villager.id] }, seedFor(party, deliveredWhole));
    await submit(repo, p, started.adventureId);
    expect(await storedItem(db, tables.player, playerKeys.hero(p, villager.id))).toMatchObject({ location: there, recruitedIn: home });
  });

  it("arriving with the cart broken: the cargo is lost and nothing delivered, and the heroes who stay land there", async () => {
    const party: UnitType[] = ["villager", "villager"];
    const { p, heroes } = await ready(party, { ore: 50 });
    const stays = must(heroes[1], "the villager who stays");
    const broken = seedFor(party, (r) => r.outcome === "complete" && r.delivered === false && r.dead.length === 0);
    const started = await start(repo, p, heroes, { cargo: [{ material: "ore", amount: 30 }], staying: [stays.id] }, broken);
    const settled = await submit(repo, p, started.adventureId);
    expect(settled.result).toMatchObject({ outcome: "complete", delivered: [], deliveryLost: [] });
    expect(await balances(repo, p, there)).toEqual({});
    expect(await balances(repo, p, home)).toMatchObject({ ore: 20 });
    expect(await ledger(p, started.adventureId, "deliver#ore")).toBeUndefined();
    expect(await repo.getHero(p, stays.id)).toMatchObject({ location: there });
    expect(await counts(p, there)).toEqual({ activeHeroes: 1, livingHeroes: 1 });
    expect(await counts(p, home)).toEqual({ activeHeroes: 1, livingHeroes: 1 });
  });

  it("on a retreat: the cargo is abandoned, everyone comes home and the slots held at the destination are let go", async () => {
    const { p, heroes } = await ready(["fighter", "villager"], { ore: 50 });
    const stays = must(heroes[1], "the villager");
    const started = await start(repo, p, heroes, { cargo: [{ material: "ore", amount: 30 }], staying: [stays.id] });
    const settled = await submit(repo, p, started.adventureId, RETREAT);
    expect(settled.result).toMatchObject({ outcome: "retreat", delivered: [], deliveryLost: [] });
    expect(await balances(repo, p, home)).toMatchObject({ ore: 20 });
    expect(await balances(repo, p, there)).toEqual({});
    expect(await repo.getHero(p, stays.id)).toMatchObject({ location: home, adventureId: null });
    expect(await sighting(home, stays.id)).toMatchObject({ heroId: stays.id });
    expect(await counts(p, there)).toEqual({ activeHeroes: 0, livingHeroes: 0 });
    expect(await counts(p, home)).toEqual({ activeHeroes: 2, livingHeroes: 2 });
  });

  it("when all are down: the cargo is lost, the heroes who meant to stay die at home and the slots are let go", async () => {
    const party: UnitType[] = ["villager"];
    const { p, heroes } = await ready(party, { ore: 50 });
    const stays = must(heroes[0], "the villager");
    const started = await start(repo, p, heroes, { cargo: [{ material: "ore", amount: 30 }], staying: [stays.id] }, seedFor(party, (r) => r.outcome === "defeat"));
    const settled = await submit(repo, p, started.adventureId);
    expect(settled.result).toMatchObject({ outcome: "defeat", delivered: [] });
    expect(await repo.getHero(p, stays.id)).toMatchObject({ location: home, status: "DEAD" });
    expect(await sighting(home, stays.id)).toBeUndefined();
    expect(await sighting(there, stays.id)).toBeUndefined();
    expect(await balances(repo, p, home)).toMatchObject({ ore: 20 });
    expect(await counts(p, there)).toEqual({ activeHeroes: 0, livingHeroes: 0 });
    // A dead hero keeps its slot until it is retired.
    expect(await counts(p, home)).toEqual({ activeHeroes: 1, livingHeroes: 0 });
  });

  it("lands a hero who died on the way at the destination, dead, with a sighting at neither location", async () => {
    const party: UnitType[] = ["villager", "villager"];
    const seed = seedFor(party, (r) => r.outcome === "complete" && r.dead.length === 1);
    const deadIndex = Number(must(replay(snapshotOf(party), seed, []).result.dead[0], "the hero who dies").replace("stand-in-", ""));
    const { p, heroes } = await ready(party);
    const dies = must(heroes[deadIndex], "the hero who dies");
    const lives = must(heroes[1 - deadIndex], "the hero who lives");
    const started = await start(repo, p, heroes, { cargo: [], staying: ids(heroes) }, seed);
    await submit(repo, p, started.adventureId);
    expect(await repo.getHero(p, dies.id)).toMatchObject({ location: there, recruitedIn: home, status: "DEAD", adventureId: null });
    expect(await sighting(home, dies.id)).toBeUndefined();
    expect(await sighting(there, dies.id)).toBeUndefined();
    expect(await repo.getHero(p, lives.id)).toMatchObject({ location: there, status: "ALIVE" });
    expect(await sighting(there, lives.id)).toMatchObject({ heroId: lives.id });
    expect(await counts(p, home)).toEqual({ activeHeroes: 0, livingHeroes: 0 });
    expect(await counts(p, there)).toEqual({ activeHeroes: 2, livingHeroes: 1 });
  });

  it("delivers up to the destination's cap, saying what the cap turned away, when the warehouse there is part full and when it is full", async () => {
    const party: UnitType[] = ["fighter", "villager"];
    const seed = seedFor(party, deliveredWhole);
    for (const [held, credit] of [[80, 20], [100, 0]] as const) {
      const { p, heroes } = await ready(party, { ore: 50 });
      await stock(repo, p, there, { ore: held });
      const started = await start(repo, p, heroes, { cargo: [{ material: "ore", amount: 50 }], staying: [] }, seed);
      const settled = await submit(repo, p, started.adventureId);
      expect(settled.result?.delivered, `${held} held`).toEqual(credit > 0 ? [{ material: "ore", amount: credit }] : []);
      expect(settled.result?.deliveryLost).toEqual([{ material: "ore", amount: 50 - credit }]);
      expect(await balances(repo, p, there)).toEqual({ ore: 100 });
      expect(await ledger(p, started.adventureId, "deliver#ore")).toMatchObject({ delta: credit, lost: 50 - credit });
    }
  });

  it("credits a resource the run dropped to the origin and the same resource carried to the destination, each to its own holding", async () => {
    const party: UnitType[] = ["fighter", "ranger"];
    const seed = seedFor(party, (r) => deliveredWhole(r) && r.rewards.some((reward) => reward.material === "hide" && reward.amount > 0));
    const dropped = replay(snapshotOf(party), seed, []).result.rewards.filter((r) => r.material === "hide").reduce((sum, r) => sum + r.amount, 0);
    const { p, heroes } = await ready(party, { hide: 10 });
    const started = await start(repo, p, heroes, { cargo: [{ material: "hide", amount: 10 }], staying: [] }, seed);
    const settled = await submit(repo, p, started.adventureId);
    expect(settled.result).toMatchObject({ credited: [{ material: "hide", amount: dropped }], delivered: [{ material: "hide", amount: 10 }] });
    expect(await balances(repo, p, home)).toMatchObject({ hide: dropped });
    expect(await balances(repo, p, there)).toEqual({ hide: 10 });
    expect(await ledger(p, started.adventureId, "credit#hide")).toMatchObject({ location: home, delta: dropped });
    expect(await ledger(p, started.adventureId, "deliver#hide")).toMatchObject({ location: there, delta: 10 });
  });

  it("delivers once when the submit is repeated", async () => {
    const party: UnitType[] = ["fighter", "villager"];
    const { p, heroes } = await ready(party, { ore: 50 });
    const started = await start(repo, p, heroes, { cargo: [{ material: "ore", amount: 30 }], staying: [ids(heroes)[1] ?? ""] }, seedFor(party, deliveredWhole));
    const timelines = new MemoryTimelines();
    const first = await submit(repo, p, started.adventureId, [], timelines);
    expect(await submit(repo, p, started.adventureId, [], timelines)).toEqual(first);
    expect(await balances(repo, p, there)).toEqual({ ore: 30 });
    expect(await counts(p, there)).toEqual({ activeHeroes: 1, livingHeroes: 1 });
  });

  it("delivers once when two submits race, at every point the other can land", async () => {
    const party: UnitType[] = ["fighter", "villager"];
    const seed = seedFor(party, deliveredWhole);
    const races = await everyInterleaving(async (k) => {
      const { p, heroes } = await ready(party, { ore: 50 });
      const started = await start(repo, p, heroes, { cargo: [{ material: "ore", amount: 30 }], staying: [ids(heroes)[1] ?? ""] }, seed);
      const timelines = new MemoryTimelines();
      const race = winnerBefore(repo, k, () => submit(repo, p, started.adventureId, [], timelines));
      const settled = await submit(race.repo, p, started.adventureId, [], timelines);
      if (!race.ran()) return false;
      expect(settled.result?.delivered, `k=${k}`).toEqual([{ material: "ore", amount: 30 }]);
      expect(await balances(repo, p, there)).toEqual({ ore: 30 });
      expect(await counts(p, there)).toEqual({ activeHeroes: 1, livingHeroes: 1 });
      expect(await counts(p, home)).toEqual({ activeHeroes: 1, livingHeroes: 1 });
      return true;
    });
    expect(races).toBeGreaterThan(0);
  });

  it("is one transaction well under DynamoDB's 100 items at its largest: a full party landing, every resource delivered and dropped, and an unlock earned", async () => {
    // The caravan with pay in every resource and the road's unlock, so that one settlement writes everything a caravan's can.
    const largest: Job = { ...caravan, pay: MATERIALS.map((material) => ({ material, amount: 1 })), grants: [road] };
    const content: AdventureContent = { ...ADVENTURE_CONTENT, jobs: { ...ADVENTURE_CONTENT.jobs, [caravan.id]: largest } };
    const party: UnitType[] = ["fighter", "villager", "villager", "villager"];
    const seed = seedFor(party, deliveredWhole, content);
    const each = Math.floor(must(CART_CAPACITY[0], "the first cart") / MATERIALS.length);
    const cargo = MATERIALS.map((material) => ({ material, amount: each }));
    const { p, heroes } = await ready(party, Object.fromEntries(cargo.map((c) => [c.material, c.amount])));
    const started = await start(repo, p, heroes, { cargo, staying: ids(heroes) }, seed);
    const send = vi.spyOn(db, "send");
    let items: number[];
    try {
      const settled = await submit(repo, p, started.adventureId, [], new MemoryTimelines(), content);
      expect(settled.result).toMatchObject({ outcome: "complete", unlocks: [road] });
      expect(settled.result?.delivered).toHaveLength(MATERIALS.length);
      expect(settled.result?.credited).toHaveLength(MATERIALS.length);
      items = send.mock.calls.map(([command]) => (command.input as { TransactItems?: unknown[] }).TransactItems?.length ?? 0).filter((n) => n > 0);
    } finally {
      send.mockRestore();
    }
    // The open item, the record, the origin camp, three for each hero who lands alive (itself and a sighting
    // put and deleted), the destination camp, two for each resource credited and each delivered (the holding
    // and its ledger entry), the feed item and the unlock.
    const expected = 3 + 3 * party.length + 1 + 2 * MATERIALS.length + 2 * MATERIALS.length + 1 + 1;
    expect(items).toEqual([expected]);
    expect(expected).toBeLessThan(100);
  });
});

describe("a caravan discarded", () => {
  it("returns its cargo to the origin up to the cap, with a ledger entry for each resource, and lets the slots at the destination go", async () => {
    const { p, heroes } = await ready(["fighter", "villager"], { ore: 60, timber: 20 });
    const stays = must(heroes[1], "the villager");
    // Issued by a deploy that can no longer verify it, which is when a discard is allowed (decision 0030).
    const started = await start(repo, p, heroes, { cargo: [{ material: "ore", amount: 50 }, { material: "timber", amount: 20 }], staying: [stays.id] }, "caravan-0", randomUUID(), "an-old-deploy");
    expect(await counts(p, there)).toEqual({ activeHeroes: 1, livingHeroes: 0 });
    // The warehouse filled while the caravan was out: a level-2 warehouse holds 200 of each, and ore is at 190.
    await stock(repo, p, home, { ore: 190 });
    const discarded = await discardAdventure(repo, p, { current: version, previous: undefined }, started.adventureId);
    expect(discarded.status).toBe("DISCARDED");
    expect(await balances(repo, p, home)).toMatchObject({ ore: 200, timber: 20 });
    expect(await ledger(p, started.adventureId, "return#ore")).toMatchObject({ location: home, delta: 10, lost: 40 });
    expect(await ledger(p, started.adventureId, "return#timber")).toMatchObject({ location: home, delta: 20, lost: 0 });
    expect(await counts(p, there)).toEqual({ activeHeroes: 0, livingHeroes: 0 });
    for (const hero of heroes) expect(await repo.getHero(p, hero.id)).toMatchObject({ location: home, adventureId: null });
    // A repeat answers the discarded adventure and returns nothing twice.
    expect((await discardAdventure(repo, p, { current: version, previous: undefined }, started.adventureId)).status).toBe("DISCARDED");
    expect(await balances(repo, p, home)).toMatchObject({ ore: 200, timber: 20 });
  });
});

describe("an open caravan's cargo", () => {
  it("is read by its player alone while it is open, and by anyone once it is settled", async () => {
    const party: UnitType[] = ["fighter", "villager"];
    const { p, heroes } = await ready(party, { ore: 50 });
    const started = await start(repo, p, heroes, { cargo: [{ material: "ore", amount: 30 }], staying: [] }, seedFor(party, deliveredWhole));
    const other = player();
    expect(await readAdventure(repo, other, started.adventureId)).toBeUndefined();
    expect((await readAdventure(repo, p, started.adventureId))?.caravan?.cargo).toEqual([{ material: "ore", amount: 30 }]);
    await submit(repo, p, started.adventureId);
    expect((await readAdventure(repo, other, started.adventureId))?.caravan?.cargo).toEqual([{ material: "ore", amount: 30 }]);
  });
});

describe("a recruit repeated after its hero moved", () => {
  it("is answered with the hero where it now is, compared with where it was recruited, and is bad input at the place it moved to", async () => {
    const party: UnitType[] = ["fighter", "villager"];
    const { p, heroes: [fighter] } = await ready(["fighter"], { timber: 20 });
    const requestId = randomUUID();
    const villager = await recruitHero(repo, p, home, "villager", requestId);
    const heroes = [must(fighter, "the fighter"), villager];
    const started = await start(repo, p, heroes, { cargo: [], staying: [villager.id] }, seedFor(party, deliveredWhole));
    await submit(repo, p, started.adventureId);
    expect(await recruitHero(repo, p, home, "villager", requestId)).toMatchObject({ id: villager.id, location: there, recruitedIn: home });
    expect(await refusal(recruitHero(repo, p, there, "villager", requestId))).toMatchObject(BAD_USER_INPUT);
  });
});
