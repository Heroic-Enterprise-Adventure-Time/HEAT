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
  HALL_CAPACITY,
  hallCapacity,
  hubLevelCarrying,
  type Job,
  JOBS,
  location,
  type Material,
  MATERIALS,
  MAX_PARTY,
  must,
  replay,
  type Reward,
  STARTING_LOCATION,
  type UnitType,
} from "@heat/engine";

import { type Tables } from "../src/db/client.js";
import { type Camp, FacilityMissing, type Hero, LocationLocked, Repository } from "../src/db/repository.js";
import { discardAdventure } from "../src/discard.js";
import { readAdventure } from "../src/read.js";
import { recruitHero } from "../src/recruit.js";
import { AdventureOpen, Conflict, HallFull, HeroAdventuring, HeroDead, HeroNotHere, HeroRetired, InsufficientResources, Requires } from "../src/refusals.js";
import { retireHero } from "../src/retire.js";
import { type CaravanRequest, startAdventure } from "../src/start.js";
import { type OverrideInput, submitAdventure } from "../src/submit.js";
import { MemoryTimelines, type Timelines } from "../src/timelines.js";
import { balances, build, connected, ids, player, putParty, putUnlock, stock, storedItem } from "./data.js";
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
 *
 * And its riders (Issue-391), the heroes who stay and are of no party: named
 * and marked at the start, refused as a hero of the party is, by the read and
 * under a race with a retire; sharing the destination's slots; landed, or
 * home alive, on each end of the run and on a discard; and a caravan written
 * before riders, read as one with none.
 */

let db: DynamoDBDocumentClient;
let tables: Tables;
let repo: Repository;

beforeAll(() => {
  ({ db, tables, repo } = connected());
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

/**
 * A player with a party at Millbrook, the caravan hub built there, the road
 * open and this stock at Millbrook; and, beside the party, this many living
 * villagers at Millbrook who are of no party, to ride (Issue-391).
 */
async function ready(unitTypes: readonly UnitType[], holdings: Partial<Record<Material, number>> = {}, riding = 0): Promise<{ p: string; heroes: Hero[]; riders: Hero[] }> {
  const p = player();
  const all = await putParty(db, tables, p, [...unitTypes, ...range(riding).map((): UnitType => "villager")], home);
  await build(repo, p, home, hub);
  await putUnlock(db, tables.player, p, road);
  await stock(repo, p, home, holdings);
  return { p, heroes: all.slice(0, unitTypes.length), riders: all.slice(unitTypes.length) };
}

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
    expect(started.caravan).toEqual({ destination: there, cargo, staying: [stays.id], riders: [] });
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

  it("is bad input for a cargo, a hero of the party who stays or a rider on a job that delivers nothing", async () => {
    const { p, heroes, riders } = await ready(["fighter", "villager"], { ore: 50 }, 1);
    const wolves = (request: CaravanRequest) => startAdventure(repo, p, version, randomUUID(), home, "wolves-on-the-mill-road", ids(heroes), request);
    expect(await refusal(wolves({ cargo: [{ material: "ore", amount: 1 }], staying: [] }))).toMatchObject(BAD_USER_INPUT);
    expect(await refusal(wolves({ cargo: [], staying: [ids(heroes)[0] ?? ""] }))).toMatchObject(BAD_USER_INPUT);
    expect(await refusal(wolves({ cargo: [], staying: ids(riders) }))).toMatchObject(BAD_USER_INPUT);
    expect(await repo.openAdventure(p)).toBeUndefined();
    expect(await repo.getHero(p, ids(riders)[0] ?? "")).toMatchObject({ adventureId: null });
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
    const fighter = must(heroes[0], "the fighter");
    const villager = must(heroes[1], "the villager");
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

  it("is one transaction well under DynamoDB's 100 items at its largest: a full party and as many riders as fill the largest hall, all landing, every resource delivered and dropped, and an unlock earned", async () => {
    // The caravan with pay in every resource and the road's unlock, so that one settlement writes everything a caravan's can.
    const largest: Job = { ...caravan, pay: MATERIALS.map((material) => ({ material, amount: 1 })), grants: [road] };
    const content: AdventureContent = { ...ADVENTURE_CONTENT, jobs: { ...ADVENTURE_CONTENT.jobs, [caravan.id]: largest } };
    const party: UnitType[] = ["fighter", "villager", "villager", "villager"];
    const seed = seedFor(party, deliveredWhole, content);
    const each = Math.floor(must(CART_CAPACITY[0], "the first cart") / MATERIALS.length);
    const cargo = MATERIALS.map((material) => ({ material, amount: each }));
    // The largest hall is the most heroes one camp holds, so the most that set out from one and the most that stay at one (`StartAdventureInput.staying`).
    const most = Math.max(...HALL_CAPACITY);
    const { p, heroes, riders } = await ready(party, Object.fromEntries(cargo.map((c) => [c.material, c.amount])), most - party.length);
    await build(repo, p, there, "heroes-hall", HALL_CAPACITY.length);
    await stock(repo, p, there, Object.fromEntries(MATERIALS.map((material) => [material, 0])));
    const started = await start(repo, p, heroes, { cargo, staying: ids([...heroes, ...riders]) }, seed);
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
    // The open item, the record, the origin camp, three for each hero who lands alive, of the party or riding
    // (itself and a sighting put and deleted), the destination camp, two for each resource credited and each
    // delivered (the holding and its ledger entry), the feed item and the unlock.
    const expected = 3 + 3 * most + 1 + 2 * MATERIALS.length + 2 * MATERIALS.length + 1 + 1;
    expect(items).toEqual([expected]);
    expect(expected).toBeLessThan(100);
    expect(await counts(p, there)).toEqual({ activeHeroes: most, livingHeroes: most });
  });
});

// Riders (Issue-391, amending decision 0059): heroes who stay at the destination and are of no party.
const named = (riders: readonly Hero[]) => riders.map((r) => ({ heroId: r.id, name: r.name }));

/** Changes a hero's item past the repository, as a death or a move leaves its status or its location. */
async function alter(p: string, heroId: string, to: Partial<Pick<Hero, "status" | "location">>): Promise<void> {
  const entries = Object.entries(to);
  await db.send(new UpdateCommand({
    TableName: tables.player,
    Key: playerKeys.hero(p, heroId),
    UpdateExpression: `SET ${entries.map((_, i) => `#k${String(i)} = :v${String(i)}`).join(", ")}`,
    ExpressionAttributeNames: Object.fromEntries(entries.map(([key], i) => [`#k${String(i)}`, key])),
    ExpressionAttributeValues: Object.fromEntries(entries.map(([, value], i) => [`:v${String(i)}`, value])),
  }));
}

describe("a caravan's riders at its start", () => {
  it("are named on the record beside everyone who stays, marked with the adventure and no part of the snapshot, and hold a slot at the destination each, more of them than a party holds", async () => {
    const { p, heroes, riders } = await ready(["fighter", "villager"], {}, MAX_PARTY + 1);
    await build(repo, p, there, "heroes-hall", 2);
    const stays = must(heroes[1], "the villager");
    const staying = [stays.id, ...ids(riders)];
    expect(staying).toHaveLength(hallCapacity(2));
    const started = await start(repo, p, heroes, { cargo: [], staying });
    expect(started.caravan).toEqual({ destination: there, cargo: [], staying, riders: named(riders) });
    expect((await repo.getAdventure(started.adventureId))?.caravan).toEqual(started.caravan);
    expect(started.snapshot.heroes.map((h) => h.heroId)).toEqual(ids(heroes));
    for (const rider of riders) expect(await repo.getHero(p, rider.id)).toMatchObject({ location: home, status: "ALIVE", adventureId: started.adventureId });
    expect(await counts(p, there)).toEqual({ activeHeroes: staying.length, livingHeroes: 0 });
    const everyone = heroes.length + riders.length;
    expect(await counts(p, home)).toEqual({ activeHeroes: everyone, livingHeroes: everyone });
  });

  it("are part of what a repeat names: the same riders in any order are the adventure it started, and others are bad input", async () => {
    const { p, heroes, riders } = await ready(["fighter"], {}, 3);
    const a = must(riders[0], "the first rider").id;
    const b = must(riders[1], "the second rider").id;
    const c = must(riders[2], "the third rider").id;
    const requestId = randomUUID();
    const started = await start(repo, p, heroes, { cargo: [], staying: [a, b] }, "caravan-0", requestId);
    expect(await start(repo, p, heroes, { cargo: [], staying: [b, a] }, "caravan-0", requestId)).toEqual(started);
    expect(await refusal(start(repo, p, heroes, { cargo: [], staying: [a, c] }, "caravan-0", requestId))).toMatchObject(BAD_USER_INPUT);
    expect(await repo.getHero(p, c)).toMatchObject({ adventureId: null });
    expect(await counts(p, there)).toEqual({ activeHeroes: 2, livingHeroes: 0 });
  });

  it("are refused as a hero of the party is, by the read, before any transaction: another player's is bad input, and one dead, retired or at another camp is refused by name", async () => {
    const { p, heroes, riders } = await ready(["fighter"], { ore: 50 }, 3);
    const dead = must(riders[0], "the dead rider");
    const retired = must(riders[1], "the retired rider");
    const away = must(riders[2], "the rider at another camp");
    await alter(p, dead.id, { status: "DEAD" });
    await retireHero(repo, p, retired.id);
    await alter(p, away.id, { location: there });
    const theirs = must((await putParty(db, tables, player(), ["villager"], home))[0], "another player's hero");
    const refused = (heroId: string) => refusal(start(repo, p, heroes, { cargo: [{ material: "ore", amount: 10 }], staying: [heroId] }));
    const transaction = vi.spyOn(Repository.prototype, "startAdventure");
    try {
      // Another player's hero is not said to exist, so it is the client's defect, not a refusal.
      expect(await refused(theirs.id)).toMatchObject(BAD_USER_INPUT);
      expect(await refused(randomUUID())).toMatchObject(BAD_USER_INPUT);
      expect(await refused(dead.id)).toBeInstanceOf(HeroDead);
      expect(await refused(dead.id)).toMatchObject({ heroId: dead.id });
      expect(await refused(retired.id)).toBeInstanceOf(HeroRetired);
      expect(await refused(away.id)).toBeInstanceOf(HeroNotHere);
      expect(transaction).not.toHaveBeenCalled();
    } finally {
      transaction.mockRestore();
    }
    expect(await repo.openAdventure(p)).toBeUndefined();
    expect(await balances(repo, p, home)).toMatchObject({ ore: 50 });
    expect(await repo.camp(p, there)).toMatchObject({ activeHeroes: 0 });
    expect(await repo.getHero(p, ids(heroes)[0] ?? "")).toMatchObject({ adventureId: null });
  });

  it("share the destination hall's free slots with the party's heroes who stay: one rider too many is HallFull, and one fewer fills the hall", async () => {
    const { p, heroes, riders } = await ready(["fighter", "villager"], {}, 2);
    await putParty(db, tables, p, ["miner", "miner"], there);
    const stays = must(heroes[1], "the villager");
    expect(await refusal(start(repo, p, heroes, { cargo: [], staying: [stays.id, ...ids(riders)] }))).toBeInstanceOf(HallFull);
    expect(await counts(p, there)).toEqual({ activeHeroes: 2, livingHeroes: 2 });
    for (const rider of riders) expect(await repo.getHero(p, rider.id)).toMatchObject({ adventureId: null });
    await start(repo, p, heroes, { cargo: [], staying: [stays.id, ...ids(riders).slice(1)] });
    expect(await counts(p, there)).toEqual({ activeHeroes: hallCapacity(1), livingHeroes: 2 });
  });

  it("cannot retire until the caravan is settled", async () => {
    const { p, heroes, riders } = await ready(["fighter"], {}, 1);
    const rider = must(riders[0], "the rider");
    const started = await start(repo, p, heroes, { cargo: [], staying: [rider.id] });
    expect(await refusal(retireHero(repo, p, rider.id))).toBeInstanceOf(HeroAdventuring);
    await submit(repo, p, started.adventureId, RETREAT);
    expect((await retireHero(repo, p, rider.id)).status).toBe("RETIRED");
  });

  it("for a rider who retires between the start's read and its transaction, at every point the retire can land: the start is told the rider has retired, and holds nothing", async () => {
    const races = await everyInterleaving(async (k) => {
      const { p, heroes, riders } = await ready(["fighter"], { ore: 50 }, 1);
      const rider = must(riders[0], "the rider");
      const race = winnerBefore(repo, k, () => retireHero(repo, p, rider.id));
      const refused = await refusal(start(race.repo, p, heroes, { cargo: [{ material: "ore", amount: 10 }], staying: [rider.id] }));
      if (!race.ran()) return false;
      expect(refused, `k=${k}`).toBeInstanceOf(HeroRetired);
      expect(refused).toMatchObject({ heroId: rider.id });
      expect(await repo.openAdventure(p)).toBeUndefined();
      expect(await balances(repo, p, home)).toMatchObject({ ore: 50 });
      expect(await repo.camp(p, there)).toMatchObject({ activeHeroes: 0 });
      expect(await repo.getHero(p, ids(heroes)[0] ?? "")).toMatchObject({ adventureId: null });
      return true;
    });
    expect(races).toBeGreaterThan(0);
  });

  it("hold a rider against its retire, at every point the start can land: the retire is told the rider is adventuring, and the rider is on that adventure", async () => {
    const races = await everyInterleaving(async (k) => {
      const { p, heroes, riders } = await ready(["fighter"], {}, 1);
      const rider = must(riders[0], "the rider");
      let adventureId: string | undefined;
      const race = winnerBefore(repo, k, async () => (adventureId = (await start(repo, p, heroes, { cargo: [], staying: [rider.id] })).adventureId));
      const refused = await refusal(retireHero(race.repo, p, rider.id));
      if (!race.ran()) return false;
      expect(refused, `k=${k}`).toBeInstanceOf(HeroAdventuring);
      expect(await repo.getHero(p, rider.id)).toMatchObject({ status: "ALIVE", adventureId });
      expect(await counts(p, home)).toEqual({ activeHeroes: 2, livingHeroes: 2 });
      expect(await counts(p, there)).toEqual({ activeHeroes: 1, livingHeroes: 0 });
      return true;
    });
    expect(races).toBeGreaterThan(0);
  });
});

describe("a caravan's riders at its settlement", () => {
  /** A rider as settlement leaves it: alive, on no adventure, with the XP and the level it set out with. */
  const settledRider = (rider: Hero, at: string) => ({ location: at, recruitedIn: home, status: "ALIVE", adventureId: null, xp: rider.xp, level: rider.level });
  /** The heroes the result has a line for. */
  const inResult = (settled: { result?: { heroes: { heroId: string }[] } | undefined }) => new Set(settled.result?.heroes.map((h) => h.heroId));

  it("arriving with the cart standing: the riders land at the destination and the party comes home, and the result has the party's lines alone", async () => {
    const party: UnitType[] = ["fighter", "villager"];
    const { p, heroes, riders } = await ready(party, { ore: 50 }, 2);
    const started = await start(repo, p, heroes, { cargo: [{ material: "ore", amount: 30 }], staying: ids(riders) }, seedFor(party, deliveredWhole));
    const settled = await submit(repo, p, started.adventureId);
    expect(settled.result).toMatchObject({ outcome: "complete", delivered: [{ material: "ore", amount: 30 }] });
    expect(settled.caravan?.riders).toEqual(named(riders));
    expect(inResult(settled)).toEqual(new Set(ids(heroes)));
    for (const rider of riders) {
      expect(await repo.getHero(p, rider.id)).toMatchObject(settledRider(rider, there));
      expect(await sighting(home, rider.id)).toBeUndefined();
      expect(await sighting(there, rider.id)).toMatchObject({ heroId: rider.id });
    }
    for (const hero of heroes) expect(await repo.getHero(p, hero.id)).toMatchObject({ location: home, adventureId: null });
    expect(await counts(p, home)).toEqual({ activeHeroes: 2, livingHeroes: 2 });
    expect(await counts(p, there)).toEqual({ activeHeroes: 2, livingHeroes: 2 });
  });

  it("arriving with the cart broken: the cargo is lost and the rider lands all the same", async () => {
    const party: UnitType[] = ["villager", "villager"];
    const { p, heroes, riders } = await ready(party, { ore: 50 }, 1);
    const rider = must(riders[0], "the rider");
    const broken = seedFor(party, (r) => r.outcome === "complete" && r.delivered === false && r.dead.length === 0);
    const started = await start(repo, p, heroes, { cargo: [{ material: "ore", amount: 30 }], staying: [rider.id] }, broken);
    const settled = await submit(repo, p, started.adventureId);
    expect(settled.result).toMatchObject({ outcome: "complete", delivered: [] });
    expect(await repo.getHero(p, rider.id)).toMatchObject(settledRider(rider, there));
    expect(await counts(p, home)).toEqual({ activeHeroes: 2, livingHeroes: 2 });
    expect(await counts(p, there)).toEqual({ activeHeroes: 1, livingHeroes: 1 });
  });

  it("arriving with a hero of the party dead: the rider lands alive, and the origin lets go of the dead hero's life and of the rider", async () => {
    const party: UnitType[] = ["villager", "villager"];
    const { p, heroes, riders } = await ready(party, {}, 1);
    const rider = must(riders[0], "the rider");
    const started = await start(repo, p, heroes, { cargo: [], staying: [rider.id] }, seedFor(party, (r) => r.outcome === "complete" && r.dead.length === 1));
    await submit(repo, p, started.adventureId);
    expect(await repo.getHero(p, rider.id)).toMatchObject(settledRider(rider, there));
    // The dead hero keeps its slot at home until it is retired.
    expect(await counts(p, home)).toEqual({ activeHeroes: 2, livingHeroes: 1 });
    expect(await counts(p, there)).toEqual({ activeHeroes: 1, livingHeroes: 1 });
  });

  it("on a retreat: the rider is home with the party, and its slot at the destination is let go", async () => {
    const { p, heroes, riders } = await ready(["fighter", "villager"], { ore: 50 }, 1);
    const rider = must(riders[0], "the rider");
    const started = await start(repo, p, heroes, { cargo: [{ material: "ore", amount: 30 }], staying: [rider.id] });
    const settled = await submit(repo, p, started.adventureId, RETREAT);
    expect(settled.result).toMatchObject({ outcome: "retreat", delivered: [] });
    expect(await repo.getHero(p, rider.id)).toMatchObject(settledRider(rider, home));
    expect(await sighting(home, rider.id)).toMatchObject({ heroId: rider.id });
    expect(await sighting(there, rider.id)).toBeUndefined();
    expect(await counts(p, home)).toEqual({ activeHeroes: 3, livingHeroes: 3 });
    expect(await counts(p, there)).toEqual({ activeHeroes: 0, livingHeroes: 0 });
  });

  it("when all are down: the party dies and the rider is home alive, with no line in the result, and its slot at the destination is let go", async () => {
    const party: UnitType[] = ["villager"];
    const { p, heroes, riders } = await ready(party, { ore: 50 }, 1);
    const rider = must(riders[0], "the rider");
    const started = await start(repo, p, heroes, { cargo: [{ material: "ore", amount: 30 }], staying: [rider.id] }, seedFor(party, (r) => r.outcome === "defeat"));
    const settled = await submit(repo, p, started.adventureId);
    expect(settled.result).toMatchObject({ outcome: "defeat", delivered: [] });
    expect(inResult(settled)).toEqual(new Set(ids(heroes)));
    expect(await repo.getHero(p, ids(heroes)[0] ?? "")).toMatchObject({ location: home, status: "DEAD" });
    expect(await repo.getHero(p, rider.id)).toMatchObject(settledRider(rider, home));
    expect(await sighting(home, rider.id)).toMatchObject({ heroId: rider.id });
    expect(await counts(p, home)).toEqual({ activeHeroes: 2, livingHeroes: 1 });
    expect(await counts(p, there)).toEqual({ activeHeroes: 0, livingHeroes: 0 });
  });

  it("lands each rider once when two submits race, at every point the other can land", async () => {
    const party: UnitType[] = ["fighter"];
    const seed = seedFor(party, deliveredWhole);
    const races = await everyInterleaving(async (k) => {
      const { p, heroes, riders } = await ready(party, {}, 1);
      const rider = must(riders[0], "the rider");
      const started = await start(repo, p, heroes, { cargo: [], staying: [rider.id] }, seed);
      const timelines = new MemoryTimelines();
      const race = winnerBefore(repo, k, () => submit(repo, p, started.adventureId, [], timelines));
      const settled = await submit(race.repo, p, started.adventureId, [], timelines);
      if (!race.ran()) return false;
      expect(settled.status, `k=${k}`).toBe("SETTLED");
      expect(await repo.getHero(p, rider.id)).toMatchObject(settledRider(rider, there));
      expect(await counts(p, home)).toEqual({ activeHeroes: 1, livingHeroes: 1 });
      expect(await counts(p, there)).toEqual({ activeHeroes: 1, livingHeroes: 1 });
      return true;
    });
    expect(races).toBeGreaterThan(0);
  });

  it("settles a caravan written before riders, read as one with none", async () => {
    const party: UnitType[] = ["fighter", "villager"];
    const { p, heroes } = await ready(party, { ore: 50 });
    const stays = must(heroes[1], "the villager");
    const started = await start(repo, p, heroes, { cargo: [{ material: "ore", amount: 30 }], staying: [stays.id] }, seedFor(party, deliveredWhole));
    const key = locationKeys.adventure(started.adventureId);
    await db.send(new UpdateCommand({ TableName: tables.location, Key: key, UpdateExpression: "REMOVE caravan.riders" }));
    expect((await storedItem(db, tables.location, key))?.["caravan"]).toEqual({ destination: there, cargo: [{ material: "ore", amount: 30 }], staying: [stays.id] });
    expect((await repo.getAdventure(started.adventureId))?.caravan?.riders).toEqual([]);
    const settled = await submit(repo, p, started.adventureId);
    expect(settled.caravan?.riders).toEqual([]);
    expect(settled.result).toMatchObject({ outcome: "complete", delivered: [{ material: "ore", amount: 30 }] });
    expect(await repo.getHero(p, stays.id)).toMatchObject({ location: there });
  });
});

describe("a caravan's riders when it is discarded", () => {
  it("are let go at home with the party, and their slots at the destination with them", async () => {
    const { p, heroes, riders } = await ready(["fighter"], { ore: 50 }, 2);
    // Issued by a deploy that can no longer verify it, which is when a discard is allowed (decision 0030).
    const started = await start(repo, p, heroes, { cargo: [{ material: "ore", amount: 30 }], staying: ids(riders) }, "caravan-0", randomUUID(), "an-old-deploy");
    expect(await counts(p, there)).toEqual({ activeHeroes: 2, livingHeroes: 0 });
    const discarded = await discardAdventure(repo, p, { current: version, previous: undefined }, started.adventureId);
    expect(discarded.status).toBe("DISCARDED");
    for (const hero of [...heroes, ...riders]) expect(await repo.getHero(p, hero.id)).toMatchObject({ location: home, status: "ALIVE", adventureId: null });
    expect(await counts(p, home)).toEqual({ activeHeroes: 3, livingHeroes: 3 });
    expect(await counts(p, there)).toEqual({ activeHeroes: 0, livingHeroes: 0 });
    expect(await balances(repo, p, home)).toMatchObject({ ore: 50 });
  });
});

// The caravan hub's second level (Issue-357): its cart carries 200 in all.
describe("the second level's cart", () => {
  const larger = must(CART_CAPACITY[1], "the second level's cart");
  const full: Reward[] = [{ material: "ore", amount: larger / 2 }, { material: "timber", amount: larger / 2 }];

  it(`carries a cargo of ${String(larger)} from a level-2 hub, debiting it at the start and delivering it whole`, async () => {
    const party: UnitType[] = ["fighter", "villager"];
    const seed = seedFor(party, deliveredWhole);
    const { p, heroes } = await ready(party);
    await build(repo, p, home, hub, 2);
    await stock(repo, p, home, { ore: larger / 2, timber: larger / 2 });
    const started = await start(repo, p, heroes, { cargo: full, staying: [] }, seed);
    expect(started.caravan?.cargo).toEqual(full);
    expect(await balances(repo, p, home)).toMatchObject({ ore: 0, timber: 0 });
    const settled = await submit(repo, p, started.adventureId);
    expect(settled.result?.delivered).toEqual(full);
    expect(await balances(repo, p, there)).toMatchObject({ ore: larger / 2, timber: larger / 2 });
  });

  it(`refuses a cargo of ${String(larger)} from a level-1 hub, saying it needs level 2, and debits nothing`, async () => {
    const { p, heroes } = await ready(["fighter"], { ore: larger / 2, timber: larger / 2 });
    const refused = await refusal(start(repo, p, heroes, { cargo: full, staying: [] }));
    expect(refused).toBeInstanceOf(Requires);
    expect(refused).toMatchObject({ missing: [{ kind: hub, level: 2 }] });
    expect(await balances(repo, p, home)).toMatchObject({ ore: larger / 2, timber: larger / 2 });
    expect(await repo.openAdventure(p)).toBeUndefined();
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
