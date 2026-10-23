import { randomUUID } from "node:crypto";
import { GraphQLError } from "graphql";
import {
  FACILITIES,
  JOBS,
  MAX_PARTY,
  UNIT_PROFILES,
  location,
  type AdventureSnapshot,
  type Job,
  type Requirement,
  type SnapshotHero,
} from "@heat/engine";
import {
  AdventureAlreadyOpen,
  FacilityMissing,
  HeroChanged,
  TransactionConflict,
  campLevels,
  type AdventureRecord,
  type Hero,
  type Repository,
} from "./db/repository.js";

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
 */

function refuse(message: string, code: string, extensions: Record<string, unknown> = {}): never {
  throw new GraphQLError(message, { extensions: { code, ...extensions } });
}

/** A second start answers with the adventure already open, which the client reads from `me`. */
function refuseOpen(adventureId: string): never {
  refuse("an adventure is already open", "ADVENTURE_OPEN", { adventureId });
}

/** The job, if the location posts it, on its board or at one of its facilities: every job names the location. */
export function jobAt(locationId: string, jobId: string): Job | undefined {
  const job = Object.hasOwn(JOBS, jobId) ? JOBS[jobId as keyof typeof JOBS] : undefined;
  return job?.location === locationId ? job : undefined;
}

/** Why a hero cannot set out from the location, or nothing if it can. */
function heroRefusal(hero: Hero | undefined, locationId: string): [message: string, code: string] | undefined {
  if (!hero) return ["not one of your heroes", "NOT_YOUR_HERO"];
  if (hero.status === "DEAD") return [`${hero.name} is dead`, "HERO_DEAD"];
  if (hero.status === "RETIRED") return [`${hero.name} has retired`, "HERO_RETIRED"];
  if (hero.location !== locationId) return [`${hero.name} is not at this camp`, "HERO_NOT_HERE"];
  if (hero.adventureId !== null) return [`${hero.name} is on an adventure`, "HERO_ADVENTURING"];
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

export async function startAdventure(
  repo: Repository,
  playerId: string,
  version: string,
  locationId: string,
  jobId: string,
  heroIds: readonly string[],
  now = new Date(),
): Promise<AdventureRecord> {
  const open = await repo.openAdventure(playerId);
  if (open) refuseOpen(open.adventureId);

  const at = location(locationId);
  if (!at) refuse(`no location ${locationId}`, "BAD_USER_INPUT");
  const job = jobAt(at.id, jobId);
  if (!job) refuse(`${at.name} has no job ${jobId}`, "NO_SUCH_JOB");

  // A facility's job needs the facility built (game.md, "Locations and camps").
  const needs: Requirement[] = job.facility ? [{ kind: job.facility, level: 1 }] : [];
  const checkFacilities = async (): Promise<void> => {
    if (needs.length === 0) return;
    const levels = campLevels(await repo.camp(playerId, at.id));
    const missing = needs.filter((r) => (levels[r.kind] ?? 0) < r.level);
    if (missing.length === 0) return;
    const words = missing.map((r) => `a level ${r.level} ${FACILITIES[r.kind].name.toLowerCase()}`).join(" and ");
    refuse(`${job.name} needs ${words} first`, "REQUIRES", { missing });
  };
  await checkFacilities();

  if (heroIds.length < 1 || heroIds.length > MAX_PARTY) refuse(`a party is 1 to ${MAX_PARTY} heroes`, "PARTY_SIZE");
  const ids = heroIds.map((id) => id.toLowerCase());
  if (new Set(ids).size !== ids.length) refuse("a hero is in the party twice", "BAD_USER_INPUT");

  const checkParty = async (): Promise<Hero[]> => {
    const heroes = await Promise.all(ids.map((id) => repo.getHero(playerId, id)));
    for (const hero of heroes) {
      const refusal = heroRefusal(hero, at.id);
      if (!refusal) continue;
      // A hero on an adventure means the player's one adventure is open: a
      // start that read none before another committed says which it is.
      if (refusal[1] === "HERO_ADVENTURING") {
        const winner = await repo.openAdventure(playerId);
        if (winner) refuseOpen(winner.adventureId);
      }
      refuse(...refusal);
    }
    return heroes as Hero[];
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
    if (!(e instanceof AdventureAlreadyOpen || e instanceof HeroChanged || e instanceof FacilityMissing || e instanceof TransactionConflict)) throw e;
    // Another request got there first: answer with what it changed.
    const winner = await repo.openAdventure(playerId);
    if (winner) refuseOpen(winner.adventureId);
    await checkParty();
    await checkFacilities();
    refuse("the party changed while starting; no adventure was started", "CONFLICT");
  }
}
