/** Builders for the adventure tests. */

import { range } from "es-toolkit";

import {
  ADVENTURE_CONTENT,
  type AdventureContent,
  type AdventureEvent,
  type AdventureSnapshot,
  type Job,
  type SnapshotHero,
  UNIT_PROFILES,
  type UnitStats,
  type UnitType,
} from "../../src/index.js";

export function hero(heroId: string, unitType: UnitType, stats: Partial<UnitStats> = {}): SnapshotHero {
  const profile = UNIT_PROFILES[unitType];
  if (!profile) throw new Error(`No profile for ${unitType}`);
  return { heroId, unitType, name: heroId, spriteSet: `${unitType}-01`, level: 1, stats: { ...profile.stats, ...stats } };
}

export function snapshot(jobId: string, heroes: readonly SnapshotHero[]): AdventureSnapshot {
  return { version: "test-version", jobId, heroes };
}

/** The game's content with one more job, or a job replaced. */
export function contentWithJob(job: Job): AdventureContent {
  return { ...ADVENTURE_CONTENT, jobs: { ...ADVENTURE_CONTENT.jobs, [job.id]: job } };
}

export function ofKind<K extends AdventureEvent["kind"]>(events: readonly AdventureEvent[], kind: K): Extract<AdventureEvent, { kind: K }>[] {
  return events.filter((e): e is Extract<AdventureEvent, { kind: K }> => e.kind === kind);
}

/** How many seeds a job is played over to say what a party brings home from it, and the seeds. */
export const SEEDS = 500;
export const seeds = range(SEEDS).map((i) => `seed-${i}`);

export const STICKS = "pick-up-sticks";
export const WOLVES = "wolves-on-the-mill-road";
export const TIMBER = "timber-from-the-near-woods";
export const ORE = "ore-from-the-hill";
