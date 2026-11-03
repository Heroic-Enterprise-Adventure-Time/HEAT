import { randomUUID } from "node:crypto";

import {
  type AdventureSnapshot,
  FACILITIES,
  type Job,
  JOBS,
  location,
  MAX_PARTY,
  type Requirement,
  type SnapshotHero,
  UNIT_PROFILES,
} from "@heat/engine";

import { retryingConflicts } from "./conflict.js";
import {
  AdventureAlreadyOpen,
  type AdventureRecord,
  campLevels,
  FacilityMissing,
  type Hero,
  HeroChanged,
  type Repository,
} from "./db/repository.js";
import { AdventureOpen, badInput, Conflict, HeroAdventuring, HeroDead, HeroNotHere, HeroRetired, type Refusal, Requires } from "./refusals.js";

/**
 * Starting an adventure from a location's job board, or from a facility the
 * camp has built (overview, "The adventure loop"; decision 0030; Issue-133).
 * The client names the location, the job and the party; the hub checks
 * them, issues the seed and the frozen
 * snapshot of the party, stamped with the deploy's version, and opens the
 * player's one adventure.
 *
 * The rules are checked twice, as recruiting's are: here, against what was
 * read, to give the player a reason; and in the transaction's conditions,
 * which are what hold under concurrent requests. A start that loses a race
 * reads again and answers with the reason it finds.
 *
 * The refusals, answered as data (`refusals.ts`): AdventureOpen, Requires
 * (the facility that posts the job, not built), HeroDead, HeroRetired,
 * HeroNotHere and HeroAdventuring for a hero of the party, and Conflict. A
 * location or job the hub does not know, a party of the wrong size or with
 * a hero twice, or a hero that is not the player's is BAD_USER_INPUT.
 */

/** A second start answers with the adventure already open, which the client reads from `me`. */
function refuseOpen(adventureId: string): never {
  throw new AdventureOpen("an adventure is already open", adventureId);
}

/** The job, if the location posts it, on its board or at one of its facilities: every job names the location. */
export function jobAt(locationId: string, jobId: string): Job | undefined {
  const job = Object.hasOwn(JOBS, jobId) ? JOBS[jobId as keyof typeof JOBS] : undefined;
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

export function startAdventure(
  repo: Repository,
  playerId: string,
  version: string,
  locationId: string,
  jobId: string,
  heroIds: readonly string[],
  now = new Date(),
): Promise<AdventureRecord> {
  return retryingConflicts("start", "the party changed while starting; no adventure was started", () => startOnce(repo, playerId, version, locationId, jobId, heroIds, now));
}

async function startOnce(
  repo: Repository,
  playerId: string,
  version: string,
  locationId: string,
  jobId: string,
  heroIds: readonly string[],
  now: Date,
): Promise<AdventureRecord> {
  const open = await repo.openAdventure(playerId);
  if (open) refuseOpen(open.adventureId);

  const at = location(locationId);
  if (!at) badInput(`no location ${locationId}`);
  const job = jobAt(at.id, jobId);
  if (!job) badInput(`${at.name} has no job ${jobId}`);

  // A facility's job needs the facility built (game.md, "Locations and camps").
  const needs: Requirement[] = job.facility ? [{ kind: job.facility, level: 1 }] : [];
  const checkFacilities = async (): Promise<void> => {
    if (needs.length === 0) return;
    const levels = campLevels(await repo.camp(playerId, at.id));
    const missing = needs.filter((r) => (levels[r.kind] ?? 0) < r.level);
    if (missing.length === 0) return;
    const words = missing.map((r) => `a level ${r.level} ${FACILITIES[r.kind].name.toLowerCase()}`).join(" and ");
    throw new Requires(`${job.name} needs ${words} first`, missing);
  };
  await checkFacilities();

  if (heroIds.length < 1 || heroIds.length > MAX_PARTY) badInput(`a party is 1 to ${MAX_PARTY} heroes`);
  const ids = heroIds.map((id) => id.toLowerCase());
  if (new Set(ids).size !== ids.length) badInput("a hero is in the party twice");

  const checkParty = async (): Promise<Hero[]> => {
    const heroes = await Promise.all(ids.map((id) => repo.getHero(playerId, id)));
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

  const snapshot: AdventureSnapshot = { version, jobId: job.id, heroes: heroes.map(snapshotHero) };
  try {
    return await repo.startAdventure(playerId, {
      adventureId: randomUUID(),
      seed: randomUUID(),
      location: at.id,
      jobId: job.id,
      snapshot,
      version,
      startedAt: now.toISOString(),
    }, needs);
  } catch (e) {
    if (!(e instanceof AdventureAlreadyOpen || e instanceof HeroChanged || e instanceof FacilityMissing)) throw e;
    // Another request got there first: answer with what it changed.
    const winner = await repo.openAdventure(playerId);
    if (winner) refuseOpen(winner.adventureId);
    await checkParty();
    await checkFacilities();
    throw new Conflict("the party changed while starting; no adventure was started");
  }
}
