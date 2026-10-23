import { randomInt } from "node:crypto";
import type { UnitType } from "@heat/engine";
import type { Hero, Repository } from "./db/repository.js";

/**
 * The heroes seen at a location (decision 0029): a hero's public fields,
 * written to the location table by the flows that change the hero, and a
 * bounded, random sample of other players' heroes read back for the camp.
 * A sighting holds no owner, so nothing read from it says whose a hero is.
 */

/** A week: use is sparse at first. Shorten it when players are enough to fill a camp without it. */
export const SIGHTING_TTL_SECONDS = 7 * 24 * 60 * 60;
/** Items one sample reads, at most, expired and own heroes included. */
export const SAMPLE_READ = 20;
/** Heroes one sample returns, at most. */
export const SAMPLE_SIZE = 6;

export interface Sighting {
  heroId: string;
  location: string;
  name: string;
  unitType: UnitType;
  spriteSet: string;
  level: number;
  seenAt: string;
  /** Epoch seconds, the location table's TTL attribute. */
  expiresAt: number;
}

export type Random = (max: number) => number;

/** The hero's public fields, seen at its location at the given time. */
export function sightingOf(hero: Hero, at: Date): Sighting {
  return {
    heroId: hero.id,
    location: hero.location,
    name: hero.name,
    unitType: hero.unitType,
    spriteSet: hero.spriteSet,
    level: hero.level,
    seenAt: at.toISOString(),
    expiresAt: Math.floor(at.getTime() / 1000) + SIGHTING_TTL_SECONDS,
  };
}

/** A random point among the sightings' keys: hero ids are random UUIDs, so this starts a random window. */
function randomStart(random: Random): string {
  return Array.from({ length: 8 }, () => random(16).toString(16)).join("");
}

/**
 * Up to SAMPLE_SIZE heroes of other players seen at the location, reading
 * at most SAMPLE_READ items: a window from a random point, wrapped round to
 * the start of the collection if it ends short; then the expired and the
 * player's own heroes are dropped and the rest shuffled.
 */
export async function heroesSeenAt(
  repo: Repository,
  playerId: string,
  location: string,
  random: Random = randomInt,
  now = new Date(),
): Promise<Sighting[]> {
  const start = randomStart(random);
  const first = await repo.sightings(location, { from: start }, SAMPLE_READ, now);
  const rest = SAMPLE_READ - first.read;
  const wrapped = rest > 0 ? await repo.sightings(location, { before: start }, rest, now) : { sightings: [], read: 0 };

  const own = new Set((await repo.heroes(playerId)).map((h) => h.id));
  const others = [...first.sightings, ...wrapped.sightings].filter((s) => !own.has(s.heroId));
  for (let i = others.length - 1; i > 0; i--) {
    const j = random(i + 1);
    const a = others[i];
    const b = others[j];
    if (a === undefined || b === undefined) throw new Error(`a shuffle index is out of range: ${i}, ${j} of ${others.length}`);
    others[i] = b;
    others[j] = a;
  }
  return others.slice(0, SAMPLE_SIZE);
}
