/** Builders for the adventure tests. */

import { range, sum } from "es-toolkit";

import {
  ADVENTURE_CONTENT,
  type AdventureContent,
  type AdventureEvent,
  type AdventureResult,
  type AdventureSnapshot,
  dropRow,
  expandStages,
  isResourceType,
  type Job,
  largestStages,
  leastStages,
  location,
  type Material,
  MONSTERS,
  must,
  replay,
  RESOURCE_NODES,
  type ResourceType,
  type SnapshotHero,
  STARTING_LOCATION,
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

/** How many hides a result brings home; none is 0. */
export function hideOf(result: AdventureResult): number {
  return rewardOf(result, "hide");
}

/** What Millbrook's hall recruits, each with its hall level and its cost, read from the content (typescript.md, rule 25). */
export const MILLBROOK_RECRUITS = must(location(STARTING_LOCATION), "Millbrook").recruits;

/** Every unit type Millbrook recruits, read from the content. */
export const RECRUITED_TYPES = MILLBROOK_RECRUITS.map((r) => r.unitType);

/** Highcrag, the second location, and what its hall recruits, read from the content. */
export const HIGHCRAG = "highcrag";
export const HIGHCRAG_RECRUITS = must(location(HIGHCRAG), "Highcrag").recruits;

/**
 * The least and the most that `count` of a resource node drop for a party
 * whose highest level in the node's trait is `level`, from the content's rows
 * (decision 0058).
 */
export function haul(type: ResourceType, level: number, count = 1): { readonly min: number; readonly max: number } {
  const drop = must(RESOURCE_NODES[type].drops[0], `the drop of a ${type}`);
  const row = must(dropRow(drop, level), `its row at level ${level}`);
  return { min: row.min * count, max: row.max * count };
}

/** The XP of the enemies a job always sets against a party, every stage's together: its least roll. */
export function enemiesXp(job: Job): number {
  return sum(
    leastStages(job).flatMap((stage) =>
      stage.kind === "fight" || stage.kind === "gather" ? stage.opponents.map((o) => o.count * (isResourceType(o.type) ? RESOURCE_NODES[o.type].xp : MONSTERS[o.type].xp)) : [],
    ),
  );
}

export function snapshot(jobId: string, heroes: readonly SnapshotHero[]): AdventureSnapshot {
  return { version: "test-version", jobId, heroes };
}

/** The game's content with one more job, or a job replaced. */
export function contentWithJob(job: Job): AdventureContent {
  return { ...ADVENTURE_CONTENT, jobs: { ...ADVENTURE_CONTENT.jobs, [job.id]: job } };
}

/**
 * The job at its largest roll, as a job with no variance: every entry
 * appears, at its most. What a time limit has to fit, and the hardest the
 * job can be for a party.
 */
export function atLargest(job: Job): Job {
  return { ...job, id: `${job.id}-at-its-largest`, stages: largestStages(job) };
}

/** Whether this adventure of the job meets the type in any stage. */
export function meets(job: Job, seed: string, type: string): boolean {
  return expandStages(job, seed).some((stage) => (stage.kind === "fight" || stage.kind === "gather") && stage.opponents.some((o) => o.type === type));
}

export function ofKind<K extends AdventureEvent["kind"]>(events: readonly AdventureEvent[], kind: K): Extract<AdventureEvent, { kind: K }>[] {
  return events.filter((e): e is Extract<AdventureEvent, { kind: K }> => e.kind === kind);
}

/** How many seeds a job is played over to say what a party brings home from it, and the seeds. */
export const SEEDS = 500;
export const seeds = range(SEEDS).map((i) => `seed-${i}`);

/** The job played by this party on every seed with nothing overridden: each seed and its result. */
export function played(jobId: string, heroes: readonly SnapshotHero[]): { readonly seed: string; readonly result: AdventureResult }[] {
  return seeds.map((seed) => ({ seed, result: replay(snapshot(jobId, heroes), seed, []).result }));
}

export const STICKS = "pick-up-sticks";
export const WOLVES = "wolves-on-the-mill-road";
export const TIMBER = "timber-from-the-near-woods";
export const ORE = "ore-from-the-hill";
export const GOBLINS = "goblins-in-the-old-workings";
export const LUMBER = "lumber-from-the-deep-woods";
export const CRAG = "ore-from-the-crag";
