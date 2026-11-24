import { randomUUID } from "node:crypto";

import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { range } from "es-toolkit";
import { getNamedType, type GraphQLInputType, isInputObjectType } from "graphql";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  ADVENTURE_CONTENT,
  type AdventureContent,
  type AdventureSnapshot,
  type Job,
  JOBS,
  jobsPostedBy,
  LOCATIONS,
  type Material,
  must,
  replay,
  STARTING_LOCATION,
  UNIT_PROFILES,
  type UnitType,
  UNLOCK_IDS,
} from "@heat/engine";

import { buildFacility } from "../src/build.js";
import { configFromEnv, createDocumentClient, type Tables } from "../src/db/client.js";
import { type AdventureRecord, type EarnedUnlock, type Hero, LocationLocked, Repository, TransactionConflict } from "../src/db/repository.js";
import { recruitHero } from "../src/recruit.js";
import { InsufficientResources } from "../src/refusals.js";
import { schema } from "../src/schema/schema.js";
import { startAdventure } from "../src/start.js";
import { type OverrideInput, submitAdventure } from "../src/submit.js";
import { MemoryTimelines } from "../src/timelines.js";
import { balances, player, putParty, putUnlock, stock, storedItem } from "./data.js";
import { locationKeys, playerKeys } from "./keys.js";
import { cancelled, everyInterleaving, type Race, winnerBefore } from "./race.js";
import { BAD_USER_INPUT, refusal } from "./refusal.js";
import { VERSION as version } from "./versions.js";

/**
 * Unlocks and the second location against DynamoDB Local (Issue-351, decision
 * 0059): an unlock written by settlement once, by the adventure that first
 * earned it, whatever repeats, races or earns it again; the player's camps,
 * the starting location's and one for each unlock held; recruit, build and
 * start refused at a location the player has not unlocked, by the read and by
 * the transaction; and Highcrag, where a hero is recruited at its own camp
 * and nothing is free.
 *
 * No job of the content grants an unlock until Issue-352, so settlement is
 * given a job that does: the wolves job with a grant, started through the
 * repository, since the verb starts only the content's jobs, and submitted
 * with the content that has it.
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
/** The one location behind an unlock, and its unlock, read from the content. */
const highcrag = must(LOCATIONS.find((l) => l.unlock !== undefined), "a location that needs an unlock");
const road = must(highcrag.unlock, "its unlock");
const crag = must(jobsPostedBy(highcrag.id, "job-board")[0], "Highcrag's board job");

const scouting: Job = { ...JOBS["wolves-on-the-mill-road"], id: "wolves-that-open-the-road", grants: [road] };
const content: AdventureContent = { ...ADVENTURE_CONTENT, jobs: { ...ADVENTURE_CONTENT.jobs, [scouting.id]: scouting } };

const snapshotOf = (heroes: readonly { id: string; unitType: UnitType; name: string; spriteSet: string }[]): AdventureSnapshot => ({
  version,
  jobId: scouting.id,
  heroes: heroes.map((h) => ({ heroId: h.id, unitType: h.unitType, name: h.name, spriteSet: h.spriteSet, level: 1, stats: must(UNIT_PROFILES[h.unitType], `the ${h.unitType}'s profile`).stats })),
});

/**
 * A seed on which a party of these unit types ends the scouting job this way,
 * every hero alive where it completes, found by asking the engine (graphql.md,
 * rule 26): a roll does not read who the heroes are, so a stand-in party of
 * the same types says what the player's will do.
 */
function seedFor(unitTypes: readonly UnitType[], outcome: "complete" | "defeat"): string {
  const standIn = snapshotOf(unitTypes.map((unitType, i) => ({ id: `stand-in-${i}`, unitType, name: unitType, spriteSet: `${unitType}-01` })));
  const ends = (seed: string): boolean => {
    const { result } = replay(standIn, seed, [], content);
    return result.outcome === outcome && (outcome === "defeat" || result.dead.length === 0);
  };
  return must(range(500).map((i) => `road-${i}`).find(ends), `a seed on which ${unitTypes.join(" and ")} end in ${outcome}`);
}

/** Opens the scouting job for the party, on the seed given. */
function startScouting(p: string, heroes: Hero[], seed: string): Promise<AdventureRecord> {
  return repo.startAdventure(p, {
    adventureId: randomUUID(), seed, location: home, jobId: scouting.id, snapshot: snapshotOf(heroes), version, startedAt: new Date().toISOString(),
  });
}

const submit = (r: Repository, p: string, adventureId: string, now: Date, timelines = new MemoryTimelines(), overrides: OverrideInput[] = []) =>
  submitAdventure(r, timelines, p, version, adventureId, overrides, now, content);

const unlockItem = (p: string) => storedItem(db, tables.player, playerKeys.unlock(p, road));

const PAIR: UnitType[] = ["fighter", "villager"];

describe("an unlock a run earned", () => {
  it("is written at settlement with its time and its adventure, listed in the result, and is the player's from then on", async () => {
    const p = player();
    const started = await startScouting(p, await putParty(db, tables, p, PAIR, home), seedFor(PAIR, "complete"));
    expect(await repo.unlocks(p)).toEqual([]);
    expect((await repo.camps(p)).map((c) => c.location)).toEqual([home]);

    const now = new Date("2026-11-24T12:00:00.000Z");
    const settled = await submit(repo, p, started.adventureId, now);
    expect(settled.result).toMatchObject({ outcome: "complete", unlocks: [road] });
    expect((await repo.getAdventure(started.adventureId))?.result?.unlocks).toEqual([road]);

    const earned: EarnedUnlock = { unlock: road, earnedAt: now.toISOString(), adventureId: started.adventureId };
    expect(await unlockItem(p)).toEqual({ ...playerKeys.unlock(p, road), playerId: p, ...earned, __edb_e__: "unlock", __edb_v__: "1" });
    expect(await repo.unlocks(p)).toEqual([earned]);
    // The camp it opens has no item, and is level 1 with no heroes until something changes it.
    expect(await repo.camps(p)).toEqual([
      expect.objectContaining({ location: home, stored: true }),
      { location: highcrag.id, hallLevel: 1, warehouseLevel: 1, activeHeroes: 0, livingHeroes: 0, holdings: [], facilities: {}, stored: false },
    ]);
    // Another player holds nothing of it.
    expect(await repo.unlocks(player())).toEqual([]);
  });

  it("is written once when the same submit is repeated, and once when two race", async () => {
    const p = player();
    const heroes = await putParty(db, tables, p, PAIR, home);
    const first = await startScouting(p, heroes, seedFor(PAIR, "complete"));
    const timelines = new MemoryTimelines();
    const now = new Date("2026-11-24T12:00:00.000Z");
    const settled = await submit(repo, p, first.adventureId, now, timelines);
    const held = await unlockItem(p);
    const repeat = await submit(repo, p, first.adventureId, new Date("2026-11-24T13:00:00.000Z"), timelines);
    expect(repeat.result).toEqual(settled.result);
    expect(await unlockItem(p)).toEqual(held);

    const q = player();
    const second = await startScouting(q, await putParty(db, tables, q, PAIR, home), seedFor(PAIR, "complete"));
    const racing = new MemoryTimelines();
    const both = await Promise.all([
      submit(repo, q, second.adventureId, new Date("2026-11-24T12:00:00.000Z"), racing),
      submit(repo, q, second.adventureId, new Date("2026-11-24T13:00:00.000Z"), racing),
    ]);
    expect(both.map((r) => r.status)).toEqual(["SETTLED", "SETTLED"]);
    const stored = must(await repo.getAdventure(second.adventureId), "the record");
    // Whichever of the two settled, the unlock's time is that settlement's.
    expect(await repo.unlocks(q)).toEqual([{ unlock: road, earnedAt: stored.settledAt, adventureId: second.adventureId }]);
  });

  /**
   * A submit raced by its own repeat, which commits as `race` places it: the
   * loser answers the record as settled, and the unlock is the winner's. A
   * party of one, so that no read of the party runs beside another (race.ts).
   */
  async function lostSubmit(race: (winner: () => Promise<unknown>) => Race): Promise<boolean> {
    const p = player();
    const started = await startScouting(p, await putParty(db, tables, p, ["fighter"], home), seedFor(["fighter"], "complete"));
    const timelines = new MemoryTimelines();
    const won = new Date("2026-11-24T12:00:00.000Z");
    const late = race(() => submit(repo, p, started.adventureId, won, timelines));
    const lost = await submit(late.repo, p, started.adventureId, new Date("2026-11-24T13:00:00.000Z"), timelines);
    const stored = must(await repo.getAdventure(started.adventureId), "the record");
    expect(lost.result).toEqual(stored.result);
    expect(stored.result?.unlocks).toEqual([road]);
    expect(await repo.unlocks(p)).toEqual([{ unlock: road, earnedAt: stored.settledAt, adventureId: started.adventureId }]);
    if (late.ran()) expect(stored.settledAt).toBe(won.toISOString());
    return late.ran();
  }

  it("is the winner's when a repeat loses the race, wherever the other commits", async () => {
    // Before each of getAdventure, camp, getHero and settle.
    expect(await everyInterleaving((k) => lostSubmit((winner) => winnerBefore(repo, k, winner)))).toBe(4);
  });

  it("is the winner's when a settlement is cancelled by its repeat in flight and runs again", async () => {
    // Before each of the next attempt's camp, getHero and settle.
    expect(await everyInterleaving((k) => lostSubmit((winner) => cancelled(repo, "settle", new TransactionConflict("conflict"), k, winner)))).toBe(3);
  });

  it("stays the first adventure's when a second earns it again, whose result lists it as the first one's does", async () => {
    const p = player();
    const heroes = await putParty(db, tables, p, PAIR, home);
    const first = await startScouting(p, heroes, seedFor(PAIR, "complete"));
    const settled = await submit(repo, p, first.adventureId, new Date("2026-11-24T12:00:00.000Z"));
    const held = await unlockItem(p);

    const second = await startScouting(p, heroes, seedFor(PAIR, "complete"));
    const again = await submit(repo, p, second.adventureId, new Date("2026-11-25T12:00:00.000Z"));
    // The second settlement is not cancelled by the unlock it finds: it settles, and pays as the first did.
    expect(again.status).toBe("SETTLED");
    expect(again.result?.unlocks).toEqual(settled.result?.unlocks);
    expect((await repo.getAdventure(second.adventureId))?.result?.unlocks).toEqual([road]);
    for (const hero of heroes) expect((await repo.getHero(p, hero.id))?.xp).toBe(2 * must(settled.result?.heroes[0], "a hero's outcome").xpGained);
    expect(await unlockItem(p)).toEqual(held);
    expect(await repo.unlocks(p)).toEqual([{ unlock: road, earnedAt: "2026-11-24T12:00:00.000Z", adventureId: first.adventureId }]);
  });

  it("is not earned by a retreat or by a party that is all down, and nothing is written", async () => {
    const p = player();
    const retreated = await startScouting(p, await putParty(db, tables, p, PAIR, home), seedFor(PAIR, "complete"));
    const order: OverrideInput[] = [{ kind: "PARTY", acceptedAtSimTime: 0, order: "RETREAT" }];
    expect((await submit(repo, p, retreated.adventureId, new Date(), new MemoryTimelines(), order)).result).toMatchObject({ outcome: "retreat", unlocks: [] });
    expect(await unlockItem(p)).toBeUndefined();

    const q = player();
    const lost = await startScouting(q, await putParty(db, tables, q, ["villager"], home), seedFor(["villager"], "defeat"));
    expect((await submit(repo, q, lost.adventureId, new Date())).result).toMatchObject({ outcome: "defeat", unlocks: [] });
    expect(await unlockItem(q)).toBeUndefined();
    expect((await repo.camps(q)).map((c) => c.location)).toEqual([home]);
  });

  it("is not written by a job that grants none: no job of the content does yet", async () => {
    expect(Object.values(JOBS).flatMap((job) => job.grants ?? [])).toEqual([]);
    const p = player();
    const heroes = await putParty(db, tables, p, PAIR, home);
    // The scouting job is the wolves job with a grant, so a seed that completes the one completes the other.
    const started = await startAdventure(repo, p, version, randomUUID(), home, "wolves-on-the-mill-road", heroes.map((h) => h.id), undefined, () => seedFor(PAIR, "complete"));
    const settled = await submitAdventure(repo, new MemoryTimelines(), p, version, started.adventureId, []);
    expect(settled.result).toMatchObject({ outcome: "complete", unlocks: [] });
    expect(await repo.unlocks(p)).toEqual([]);
  });
});

describe("the player's camps", () => {
  it("are the starting location's alone for a player who holds no unlock, whatever items lie at another location", async () => {
    const p = player();
    expect(await repo.camps(p)).toEqual([expect.objectContaining({ location: home, stored: false })]);
    // Stock at Highcrag, which no verb could have put there, makes no camp of it.
    await repo.setBalance(p, highcrag.id, "ore", 50);
    expect((await repo.camps(p)).map((c) => c.location)).toEqual([home]);
  });

  it("are one for every location once every unlock is held, in the content's order", async () => {
    const p = player();
    for (const unlock of UNLOCK_IDS) await putUnlock(db, tables.player, p, unlock);
    expect((await repo.camps(p)).map((c) => c.location)).toEqual(LOCATIONS.map((l) => l.id));
  });
});

/** Enough of everything a fighter and a warehouse's second level cost. */
const PLENTY = { ore: 100, timber: 100 } as const;

/**
 * A repository whose read says the player holds every unlock, as no read can
 * while an unlock is never taken away: what is left to refuse a locked
 * location is the transaction's own condition.
 */
function trusting(): Repository {
  return new (class extends Repository {
    override unlocks(): Promise<EarnedUnlock[]> {
      return Promise.resolve(UNLOCK_IDS.map((unlock) => ({ unlock, earnedAt: "2026-11-24T12:00:00.000Z", adventureId: "none" })));
    }
  })(db, tables);
}

describe("a location the player has not unlocked", () => {
  /**
   * Each verb that takes a location, by its mutation, for a player whose camp
   * there passes every other rule: the repository's transaction it ends in,
   * and what it leaves when it is let through. Each is something Millbrook
   * and Highcrag both offer: a fighter, the warehouse's second level and a
   * job on the board.
   */
  const VERBS = [
    {
      mutation: "recruitHero",
      transaction: "recruit",
      run: (r: Repository, p: string, at: string) => recruitHero(r, p, at, "fighter", randomUUID()),
      done: async (p: string, _at: string) => { expect((await repo.heroes(p)).map((h) => h.unitType).sort()).toEqual(["fighter", "miner"]); },
    },
    {
      mutation: "buildFacility",
      transaction: "build",
      run: (r: Repository, p: string, at: string) => buildFacility(r, p, at, "warehouse", 2),
      done: async (p: string, at: string) => { expect((await repo.camp(p, at)).warehouseLevel).toBe(2); },
    },
    {
      mutation: "startAdventure",
      transaction: "startAdventure",
      run: async (r: Repository, p: string, at: string) =>
        startAdventure(r, p, version, randomUUID(), at, must(jobsPostedBy(at, "job-board")[0], "a job on the board").id, (await repo.heroes(p)).map((h) => h.id)),
      done: async (p: string, _at: string) => { expect(await repo.openAdventure(p)).toBeDefined(); },
    },
  ] as const;

  /** A player with a miner and stock at the location, put past the verbs, and no unlock. */
  async function camped(at: string): Promise<string> {
    const p = player();
    await putParty(db, tables, p, ["miner"], at);
    await stock(repo, p, at, PLENTY);
    return p;
  }

  async function untouched(p: string): Promise<void> {
    expect(await balances(repo, p, highcrag.id)).toEqual(PLENTY);
    expect(await repo.camp(p, highcrag.id)).toMatchObject({ hallLevel: 1, warehouseLevel: 1, activeHeroes: 1, livingHeroes: 1 });
    expect(await repo.openAdventure(p)).toBeUndefined();
    expect((await repo.heroes(p)).map((h) => h.adventureId)).toEqual([null]);
  }

  it("is refused by every mutation whose input names a location, read off the schema: the verbs below are all of them", () => {
    const takesLocation = (field: { args: readonly { type: GraphQLInputType }[] }) =>
      field.args.some((arg) => {
        const input = getNamedType(arg.type);
        return isInputObjectType(input) && Object.hasOwn(input.getFields(), "location");
      });
    const mutations = Object.values(must(schema.getMutationType(), "the mutation type").getFields()).filter(takesLocation).map((field) => field.name);
    expect(mutations.length).toBeGreaterThan(0);
    expect(VERBS.map((verb) => verb.mutation).sort()).toEqual(mutations.sort());
  });

  for (const verb of VERBS) {
    it(`refuses ${verb.mutation} by its read, as bad input, before any transaction`, async () => {
      const p = await camped(highcrag.id);
      const transaction = vi.spyOn(Repository.prototype, verb.transaction);
      try {
        expect(await refusal(verb.run(repo, p, highcrag.id))).toMatchObject(BAD_USER_INPUT);
        expect(transaction).not.toHaveBeenCalled();
      } finally {
        transaction.mockRestore();
      }
      await untouched(p);
    });

    it(`refuses ${verb.mutation} by its transaction when the read is wrong, as bad input, and writes nothing`, async () => {
      const p = await camped(highcrag.id);
      const transaction = vi.spyOn(Repository.prototype, verb.transaction);
      try {
        expect(await refusal(verb.run(trusting(), p, highcrag.id))).toMatchObject(BAD_USER_INPUT);
        expect(transaction).toHaveBeenCalledTimes(1);
        await expect(transaction.mock.results[0]?.value).rejects.toBeInstanceOf(LocationLocked);
      } finally {
        transaction.mockRestore();
      }
      await untouched(p);
    });

    it(`lets ${verb.mutation} through once the unlock is held`, async () => {
      const p = await camped(highcrag.id);
      await putUnlock(db, tables.player, p, road);
      await verb.run(repo, p, highcrag.id);
      await verb.done(p, highcrag.id);
    });

    it(`reads and checks no unlock for ${verb.mutation} at the starting location, which needs none`, async () => {
      const p = await camped(home);
      const send = vi.spyOn(db, "send");
      try {
        await verb.run(repo, p, home);
        // Every request the verb made of DynamoDB, its reads and its transaction: none names an unlock's item.
        const requests = send.mock.calls.map(([command]) => JSON.stringify(command.input));
        expect(requests.some((request) => request.includes("TransactItems"))).toBe(true);
        expect(requests.join()).not.toContain("UNLOCK#");
      } finally {
        send.mockRestore();
      }
      await verb.done(p, home);
    });
  }
});

describe("Highcrag", () => {
  /** A player who has opened the road, with this stock at Highcrag. */
  async function arrived(holdings: Partial<Record<Material, number>> = {}): Promise<string> {
    const p = player();
    await putUnlock(db, tables.player, p, road);
    await stock(repo, p, highcrag.id, holdings);
    return p;
  }

  it("recruits each unit type on its list at its own camp, for its cost from that camp's stock, and is seen there", async () => {
    for (const recruit of highcrag.recruits) {
      const p = await arrived(PLENTY);
      const requestId = randomUUID();
      const hero = await recruitHero(repo, p, highcrag.id, recruit.unitType, requestId);
      expect(hero).toMatchObject({ id: requestId, location: highcrag.id, unitType: recruit.unitType, status: "ALIVE" });
      expect(recruit.cost.length, recruit.unitType).toBeGreaterThan(0);
      const paid: Record<string, number> = { ...PLENTY };
      for (const { material, amount } of recruit.cost) paid[material] = must(paid[material], `the stock of ${material}`) - amount;
      expect(await balances(repo, p, highcrag.id), recruit.unitType).toEqual(paid);
      for (const { material, amount } of recruit.cost) {
        expect(await storedItem(db, tables.player, playerKeys.ledger(p, requestId, `debit#${material}`))).toMatchObject({ location: highcrag.id, delta: -amount });
      }
      // The camp's item is made by its first recruit, and Millbrook's camp is not touched.
      expect(await repo.camp(p, highcrag.id)).toMatchObject({ activeHeroes: 1, livingHeroes: 1, hallLevel: 1, stored: true });
      expect(await repo.camp(p, home)).toMatchObject({ activeHeroes: 0, stored: false });
      expect(await storedItem(db, tables.location, locationKeys.seen(highcrag.id, requestId))).toMatchObject({ name: hero.name, unitType: recruit.unitType });
      expect(await storedItem(db, tables.location, locationKeys.seen(home, requestId))).toBeUndefined();
    }
  });

  it("has no free hero: with no hero alive every recruit on its list is refused for its whole cost, and Millbrook's stock does not pay", async () => {
    const p = await arrived();
    await stock(repo, p, home, PLENTY);
    for (const recruit of highcrag.recruits) {
      const refused = await refusal(recruitHero(repo, p, highcrag.id, recruit.unitType, randomUUID()));
      expect(refused, recruit.unitType).toBeInstanceOf(InsufficientResources);
      expect(refused, recruit.unitType).toMatchObject({ short: recruit.cost.map(({ material, amount }) => ({ material, amount, balance: 0 })) });
    }
    expect(await repo.heroes(p)).toEqual([]);
    expect(await balances(repo, p, home)).toEqual(PLENTY);
  });

  it("does not recruit the villager, which Millbrook still gives a player with no hero for nothing", async () => {
    const p = await arrived(PLENTY);
    expect(highcrag.recruits.map((r) => r.unitType)).not.toContain("villager");
    expect(await refusal(recruitHero(repo, p, highcrag.id, "villager", randomUUID()))).toMatchObject(BAD_USER_INPUT);
    expect(await balances(repo, p, highcrag.id)).toEqual(PLENTY);
    const free = await recruitHero(repo, p, home, "villager", randomUUID());
    expect(free).toMatchObject({ location: home, unitType: "villager" });
    expect(await repo.holdings(p, home)).toEqual([]);
  });

  it("refuses a request id reused for another location, and charges nothing for it", async () => {
    const p = await arrived(PLENTY);
    await stock(repo, p, home, PLENTY);
    const requestId = randomUUID();
    const first = await recruitHero(repo, p, highcrag.id, "fighter", requestId);
    const afterFirst = await balances(repo, p, highcrag.id);
    expect(await refusal(recruitHero(repo, p, home, "fighter", requestId))).toMatchObject(BAD_USER_INPUT);
    expect(await balances(repo, p, home)).toEqual(PLENTY);
    // The repeat at the location it named is still answered with its hero.
    expect(await recruitHero(repo, p, highcrag.id, "fighter", requestId)).toEqual(first);
    expect(await balances(repo, p, highcrag.id)).toEqual(afterFirst);
  });

  it("posts its board job to a miner recruited there, and credits the ore to Highcrag's own warehouse", async () => {
    const p = await arrived(PLENTY);
    await stock(repo, p, home, { ore: 7 });
    const miner = await recruitHero(repo, p, highcrag.id, "miner", randomUUID());
    const before = must((await balances(repo, p, highcrag.id))["ore"], "the ore left after the recruit");
    // A seed the engine's own test of the job plays, so the run is one it holds: a lone miner completes it.
    const started = await startAdventure(repo, p, version, randomUUID(), highcrag.id, crag.id, [miner.id], undefined, () => "seed-0");
    expect(started).toMatchObject({ location: highcrag.id, jobId: crag.id, status: "OPEN" });
    const expected = replay(started.snapshot, started.seed, []).result;
    expect(expected.outcome).toBe("complete");

    const settled = await submitAdventure(repo, new MemoryTimelines(), p, version, started.adventureId, []);
    const ore = must(expected.rewards.find((r) => r.material === "ore"), "the ore").amount;
    // A level-1 warehouse holds 100 of each, so what the cap turns away is said, and the rest is credited there.
    const credited = must(settled.result?.credited.find((r) => r.material === "ore"), "the ore credited").amount;
    expect(credited + (settled.result?.lost.find((r) => r.material === "ore")?.amount ?? 0)).toBe(ore);
    expect((await balances(repo, p, highcrag.id))["ore"]).toBe(before + credited);
    expect(await balances(repo, p, home)).toEqual({ ore: 7 });
    // A job of another location is not started from Highcrag's camp.
    expect(await refusal(startAdventure(repo, p, version, randomUUID(), highcrag.id, "wolves-on-the-mill-road", [miner.id]))).toMatchObject(BAD_USER_INPUT);
  });

  it("builds a level of a facility every camp has, from Highcrag's own stock", async () => {
    const p = await arrived({ timber: 80, ore: 40 });
    const camp = await buildFacility(repo, p, highcrag.id, "warehouse", 2);
    expect(camp).toMatchObject({ location: highcrag.id, warehouseLevel: 2, hallLevel: 1, stored: true });
    expect(await balances(repo, p, highcrag.id)).toEqual({ timber: 0, ore: 0 });
    expect(await repo.camp(p, home)).toMatchObject({ warehouseLevel: 1, stored: false });
  });
});
