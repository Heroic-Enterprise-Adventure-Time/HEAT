/** Builders for the adventure tests. */

import { range } from "es-toolkit";

import {
  ADVENTURE_CONTENT,
  type AdventureContent,
  type AdventureEvent,
  type AdventureResult,
  type AdventureSnapshot,
  type Job,
  type Material,
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

/** A party by its unit types, each hero named for its type and its place: `villager-2`. */
export function party(...types: UnitType[]): SnapshotHero[] {
  return types.map((type, i) => hero(`${type}-${i + 1}`, type));
}

/** A party of villagers alone. */
export function villagers(count: number): SnapshotHero[] {
  return range(count).map((i) => hero(`villager-${i + 1}`, "villager"));
}

/** How much of a material a result brings home; none is 0. */
export function rewardOf(result: AdventureResult, material: Material): number {
  return result.rewards.find((r) => r.material === material)?.amount ?? 0;
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
export const GOBLINS = "goblins-in-the-old-workings";
