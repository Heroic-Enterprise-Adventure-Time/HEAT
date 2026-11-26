import { randomUUID } from "node:crypto";

import { sumBy } from "es-toolkit";

import {
  type AdventureSnapshot,
  CART_CAPACITY,
  FACILITIES,
  hallCapacity,
  hubLevelCarrying,
  type Job,
  jobOf,
  type Location,
  type Requirement,
  type Reward,
  type SnapshotHero,
  UNIT_PROFILES,
} from "@heat/engine";

import { retryingConflicts } from "./conflict.js";
import {
  AdventureAlreadyOpen,
  type AdventureRecord,
  AlreadyApplied,
  campLevels,
  type CaravanStart,
  DestinationFull,
  FacilityMissing,
  type Hero,
  HeroChanged,
  InsufficientBalance,
  LocationLocked,
  type Repository,
} from "./db/repository.js";
import { campLocation, refuseNoCamp } from "./locations.js";
import {
  AdventureOpen,
  badInput,
  Conflict,
  HallFull,
  HeroAdventuring,
  HeroDead,
  HeroNotHere,
  HeroRetired,
  InsufficientResources,
  Refusal,
  Requires,
} from "./refusals.js";

/**
 * Starting an adventure from a location's job board, or from a facility the
 * camp has built (overview, "The adventure loop"; decision 0030; Issue-133).
 * The client names the location, the job, the party and the request's id,
 * which becomes the adventure's id; the hub checks them, issues the seed and
 * the frozen snapshot of the party, stamped with the deploy's version, and
 * opens the player's one adventure. A repeat answers the adventure the
 * request started, as it is (graphql.md, rule 7). The seed is drawn by
 * `issueSeed`, the cryptographic source unless a test passes the seed it
 * means (graphql.md, rules 10 and 25): no caller outside a test passes one,
 * and nothing of a request reaches it.
 *
 * The rules are checked twice, as recruiting's are: here, against what was
 * read, to give the player a reason; and in the transaction's conditions,
 * which are what hold under concurrent requests. A start that loses a race
 * reads again and answers with the reason it finds.
 *
 * The refusals, answered as data (`refusals.ts`): AdventureOpen, Requires
 * (the facility that posts the job, not built), HeroDead, HeroRetired,
 * HeroNotHere and HeroAdventuring for a hero of the party, and Conflict. A
 * location the player has no camp at (locations.ts, decision 0059), a job the
 * location does not post, or a hero that is not the player's, is
 * BAD_USER_INPUT; the party is 1 to MAX_PARTY distinct lower-case ids by the
 * time it arrives (`StartAdventureInput`).
 *
 * A caravan, a job that delivers (decision 0059), also takes its cargo and
 * the heroes of the party who stay at the destination. Its start debits the
 * cargo from the origin's holdings and holds a slot in the destination's
 * hall for each hero who stays, in the same transaction. Its refusals are
 * InsufficientResources, a cargo the origin cannot pay, and HallFull, a
 * destination hall with no slot for everyone who stays. A destination the
 * player has no camp at, a cargo the caravan hub's cart cannot carry, a hero
 * marked to stay who is not of the party, or a cargo or a hero marked to
 * stay on a job that delivers nothing, is BAD_USER_INPUT: the page offers
 * none of them. Each resource is in the cargo once by the time it arrives
 * (`StartAdventureInput`).
 */

/** What a caravan carries and who stays, as the request names them; empty for any other job. */
export interface CaravanRequest {
  cargo: readonly Reward[];
  staying: readonly string[];
}

const NO_CARAVAN: CaravanRequest = { cargo: [], staying: [] };

/** A second start answers with the adventure already open, which the client reads from `me`. */
function refuseOpen(adventureId: string): never {
  throw new AdventureOpen("an adventure is already open", adventureId);
}

/** The job, if the location posts it, on its board or at one of its facilities: every job names the location. */
export function jobAt(locationId: string, jobId: string): Job | undefined {
  const job = jobOf(jobId);
  return job?.location === locationId ? job : undefined;
}

/** Why a hero cannot set out from the location, or nothing if it can. */
function heroRefusal(hero: Hero, locationId: string): Refusal | undefined {
  if (hero.status === "DEAD") return new HeroDead(`${hero.name} is dead`, hero.id);
  if (hero.status === "RETIRED") return new HeroRetired(`${hero.name} has retired`, hero.id);
  if (hero.location !== locationId) return new HeroNotHere(`${hero.name} is not at this camp`, hero.id);
  if (hero.adventureId !== null) return new HeroAdventuring(`${hero.name} is on an adventure`, hero.id);
  return undefined;
}

/**
 * The hero as the snapshot gives it: its effective stats are its unit
 * type's, because levels add no stats yet and there are no picks
 * (game.md, "Heroes", keeps them for a later issue).
 */
function snapshotHero(hero: Hero): SnapshotHero {
  const profile = UNIT_PROFILES[hero.unitType];
  // Every unit type a location recruits has a profile; a unit type without
  // one is content not built yet, not a player's mistake.
  if (!profile) throw new Error(`unit type ${hero.unitType} has no combat profile`);
  return {
    heroId: hero.id,
    unitType: hero.unitType,
    name: hero.name,
    spriteSet: hero.spriteSet,
    level: hero.level,
    stats: profile.stats,
  };
}

/**
 * The adventure this request started, if any: its request id is the
 * adventure's id (graphql.md, rule 7), and it is answered as it is now,
 * open, settled or discarded. The id with another location, job or party,
 * or another player's adventure, is the client's defect: BAD_USER_INPUT,
 * never the first request's adventure.
 */
async function startedBy(
  repo: Repository,
  playerId: string,
  requestId: string,
  locationId: string,
  jobId: string,
  heroIds: readonly string[],
  caravan: CaravanRequest,
): Promise<AdventureRecord | undefined> {
  const adventure = await repo.getAdventure(requestId);
  if (!adventure) return undefined;
  const party = adventure.snapshot.heroes.map((h) => h.heroId);
  // The ids and the materials are distinct (StartAdventureInput), so the same ones in any order are the same.
  const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && b.every((id) => a.includes(id));
  const cargo = adventure.caravan?.cargo ?? [];
  const sameCargo = cargo.length === caravan.cargo.length && caravan.cargo.every((c) => cargo.some((d) => d.material === c.material && d.amount === c.amount));
  const sameCaravan = sameCargo && sameIds(adventure.caravan?.staying ?? [], caravan.staying);
  const same = adventure.playerId === playerId && adventure.location === locationId && adventure.jobId === jobId && sameIds(party, heroIds) && sameCaravan;
  if (!same) badInput(`request ${requestId} started another adventure`);
  return adventure;
}

export function startAdventure(
  repo: Repository,
  playerId: string,
  version: string,
  requestId: string,
  locationId: string,
  jobId: string,
  heroIds: readonly string[],
  now = new Date(),
  issueSeed: () => string = randomUUID,
  caravan: CaravanRequest = NO_CARAVAN,
): Promise<AdventureRecord> {
  return retryingConflicts("start", "the party changed while starting; no adventure was started", async () => {
    try {
      return await startOnce(repo, playerId, version, requestId, locationId, jobId, heroIds, now, issueSeed, caravan);
    } catch (e) {
      // A refusal is final only once the work is read as not done after it
      // (graphql.md, rule 9). A repeat of a start that committed, the
      // player's or the SDK's retry of a transaction whose answer timed out,
      // finds its own adventure open, or its party on it or back, and is
      // answered with that adventure.
      if (!(e instanceof Refusal)) throw e;
      const started = await startedBy(repo, playerId, requestId, locationId, jobId, heroIds, caravan);
      if (started) return started;
      throw e;
    }
  });
}

async function startOnce(
  repo: Repository,
  playerId: string,
  version: string,
  requestId: string,
  locationId: string,
  jobId: string,
  heroIds: readonly string[],
  now: Date,
  issueSeed: () => string,
  caravan: CaravanRequest,
): Promise<AdventureRecord> {
  const open = await repo.openAdventure(playerId);
  if (open) refuseOpen(open.adventureId);

  const at = await campLocation(repo, playerId, locationId);
  const job = jobAt(at.id, jobId);
  if (!job) badInput(`${at.name} has no job ${jobId}`);
  const { destination, hubLevel } = await caravanShape(repo, playerId, job, heroIds, caravan);

  // A facility's job needs the facility built (game.md, "Locations and camps"),
  // and a caravan's hub the level whose cart carries its cargo (decision 0059).
  const needs: Requirement[] = job.facility ? [{ kind: job.facility, level: hubLevel }] : [];
  const checkFacilities = async (): Promise<void> => {
    if (needs.length === 0) return;
    const levels = campLevels(await repo.camp(playerId, at.id));
    const missing = needs.filter((r) => (levels[r.kind] ?? 0) < r.level);
    if (missing.length === 0) return;
    const words = missing.map((r) => `a level ${r.level} ${FACILITIES[r.kind].name.toLowerCase()}`).join(" and ");
    throw new Requires(`${job.name} needs ${words} first`, missing);
  };
  await checkFacilities();

  const checkParty = async (): Promise<Hero[]> => {
    const heroes = await Promise.all(heroIds.map((id) => repo.getHero(playerId, id)));
    const party: Hero[] = [];
    for (const hero of heroes) {
      // Another player's hero is not said to exist.
      if (!hero) badInput("not one of your heroes");
      const refusal = heroRefusal(hero, at.id);
      if (!refusal) {
        party.push(hero);
        continue;
      }
      // A hero on an adventure means the player's one adventure is open: a
      // start that read none before another committed says which it is.
      if (refusal instanceof HeroAdventuring) {
        const winner = await repo.openAdventure(playerId);
        if (winner) refuseOpen(winner.adventureId);
      }
      throw refusal;
    }
    return party;
  };
  const heroes = await checkParty();

  // A caravan's cargo against the origin's holdings, and its heroes who stay against the destination's hall.
  // Another start that committed since the first read took the balance or the slot with its own adventure,
  // so before either refusal the open item is read again, as a hero on an adventure is answered above.
  const refuseCaravan = async (refusal: Refusal): Promise<never> => {
    const winner = await repo.openAdventure(playerId);
    if (winner) refuseOpen(winner.adventureId);
    throw refusal;
  };
  const checkCaravan = async (): Promise<CaravanStart | undefined> => {
    if (destination === undefined) return undefined;
    const origin = await repo.camp(playerId, at.id);
    const short = caravan.cargo
      .map(({ material, amount }) => ({ material, amount, balance: origin.holdings.find((h) => h.material === material)?.balance ?? 0 }))
      .filter((c) => c.balance < c.amount);
    if (short.length > 0) {
      const words = short.map((c) => `${c.amount} ${c.material}, and the camp has ${c.balance}`).join("; ");
      return refuseCaravan(new InsufficientResources(`the cargo needs ${words}`, short));
    }
    const there = await repo.camp(playerId, destination.id);
    const capacity = hallCapacity(there.hallLevel);
    if (there.activeHeroes + caravan.staying.length > capacity) return refuseCaravan(new HallFull(`the heroes hall at ${destination.name} has no room for everyone who stays`));
    return { caravan: { destination: destination.id, cargo: [...caravan.cargo], staying: [...caravan.staying] }, destination: there, capacity };
  };
  const carrying = await checkCaravan();

  const snapshot: AdventureSnapshot = { version, jobId: job.id, heroes: heroes.map(snapshotHero) };
  try {
    return await repo.startAdventure(playerId, {
      adventureId: requestId,
      seed: issueSeed(),
      location: at.id,
      jobId: job.id,
      snapshot,
      version,
      startedAt: now.toISOString(),
    }, needs, carrying);
  } catch (e) {
    // The transaction's own check of an unlock, which the reads above passed: an unlock is never taken away, so
    // nothing explains it but a read. The one that failed is the destination's where the origin needs none.
    if (e instanceof LocationLocked) refuseNoCamp(destination !== undefined && at.unlock === undefined ? destination.id : at.id);
    // AlreadyApplied: the record exists with no open item, a repeat after the adventure ended.
    const raced = [AdventureAlreadyOpen, AlreadyApplied, HeroChanged, FacilityMissing, InsufficientBalance, DestinationFull].some((t) => e instanceof t);
    if (!raced) throw e;
    // Another request got there first: answer with what it changed.
    const winner = await repo.openAdventure(playerId);
    if (winner) refuseOpen(winner.adventureId);
    await checkParty();
    await checkFacilities();
    await checkCaravan();
    throw new Conflict("the party changed while starting; no adventure was started");
  }
}

/**
 * A caravan's request against its job, before anything of a camp is read:
 * the destination, which must be a camp of the player's, and the least hub
 * level whose cart carries the cargo, which the start holds as the hub's
 * requirement (decision 0059). A job that delivers nothing takes no cargo
 * and leaves nobody, and needs its facility at level 1, as every facility's
 * job does.
 */
async function caravanShape(
  repo: Repository,
  playerId: string,
  job: Job,
  heroIds: readonly string[],
  caravan: CaravanRequest,
): Promise<{ destination: Location | undefined; hubLevel: number }> {
  if (job.deliversTo === undefined) {
    if (caravan.cargo.length > 0 || caravan.staying.length > 0) badInput(`${job.name} carries no cargo and leaves nobody anywhere`);
    return { destination: undefined, hubLevel: 1 };
  }
  const stray = caravan.staying.find((id) => !heroIds.includes(id));
  if (stray !== undefined) badInput(`${stray} is not of the party`);
  const destination = await campLocation(repo, playerId, job.deliversTo);
  const load = sumBy(caravan.cargo, (c) => c.amount);
  const hubLevel = hubLevelCarrying(load);
  if (hubLevel === undefined) badInput(`no cart carries ${load}; the largest carries ${CART_CAPACITY.at(-1) ?? 0}`);
  return { destination, hubLevel };
}
