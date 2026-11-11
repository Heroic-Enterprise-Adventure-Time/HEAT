import { type AdventureOutcome, jobOf, must, type Reward, type StageResult, type UnitType } from "@heat/engine";

import type { Repository, Settlement } from "./db/repository.js";

/**
 * The adventures recently completed at a location (decision 0050): one feed
 * item per settled adventure in the location's collection, written by the
 * settle transaction and by nothing else, and the newest of them read back
 * for the job board. An item is a copy of the record's public line, with no
 * owner, so nothing read from it says whose an adventure was.
 */

/** A week (decision 0050): use is sparse, and a shorter time would leave the list empty most days. The feed's own, whatever a sighting's week becomes. */
export const RECENT_TTL_SECONDS = 7 * 24 * 60 * 60;
/** Items one read of the list takes, at most, the expired included. */
export const RECENT_READ = 20;

/** One hero of the party, by its public fields: the level is the one it came home at, or died at. */
export interface RecentHero {
  name: string;
  unitType: UnitType;
  spriteSet: string;
  level: number;
  died: boolean;
}

export interface RecentAdventure {
  adventureId: string;
  location: string;
  jobId: string;
  outcome: AdventureOutcome;
  stages: StageResult[];
  credited: Reward[];
  party: RecentHero[];
  settledAt: string;
  /** Epoch seconds, the location table's TTL attribute. */
  expiresAt: number;
}

/** The settlement's public line, as the feed keeps it from the given time: the party in the order it set out. */
export function recentOf(s: Settlement, at: Date): RecentAdventure {
  const heroes = new Map([...s.survivors.map((survivor) => survivor.hero), ...s.dead].map((hero) => [hero.id, hero]));
  return {
    adventureId: s.adventureId,
    location: s.location,
    jobId: s.jobId,
    outcome: s.result.outcome,
    stages: s.result.stages,
    credited: s.result.credited,
    party: s.result.heroes.map((outcome) => {
      const hero = must(heroes.get(outcome.heroId), `the hero ${outcome.heroId} of the settlement`);
      return { name: hero.name, unitType: hero.unitType, spriteSet: hero.spriteSet, level: outcome.level, died: outcome.dead };
    }),
    settledAt: at.toISOString(),
    expiresAt: Math.floor(at.getTime() / 1000) + RECENT_TTL_SECONDS,
  };
}

/**
 * The adventures most recently settled at the location, newest first, from
 * one read of at most RECENT_READ items. An adventure of a job this deploy's
 * content does not know is left out: nothing here could name the job, and
 * its replay is another version's.
 */
export async function recentAdventuresAt(repo: Repository, location: string, now = new Date()): Promise<RecentAdventure[]> {
  const recent = await repo.recentAdventures(location, RECENT_READ, now);
  return recent.filter((adventure) => jobOf(adventure.jobId) !== undefined);
}
