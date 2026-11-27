import { randomInt } from "node:crypto";

import {
  hallCapacity,
  heroNames,
  type Recruit,
  recruitCost,
  recruitRefusal,
  SPRITE_SET_PRESENTATION,
  SPRITE_SETS,
} from "@heat/engine";

import { retryingConflicts } from "./conflict.js";
import {
  type Camp,
  type Hero,
  HeroExists,
  InsufficientBalance,
  LocationLocked,
  RecruitRefused,
  type Repository,
} from "./db/repository.js";
import { campLocation, refuseNoCamp } from "./locations.js";
import { badInput, Conflict, HallFull, HallLevel, InsufficientResources, type Refusal } from "./refusals.js";

/**
 * Recruitment (decisions 0026 and 0059): the client names the camp's
 * location, the unit type and a request id, and the hub draws the rest. The
 * request id becomes the hero id, so a repeated request answers with the hero
 * it already made. Any unit type on the location's list can be recruited at
 * its hall level, paid in resources; the villager is free when no hero at the
 * camp is alive (`recruitCost`), which is a rule of the locations that
 * recruit one: Highcrag does not, so nothing is free there.
 *
 * The rules are checked twice, on purpose: here, against the camp as read,
 * to give the player a reason; and in the transaction's conditions, which
 * are what actually hold under concurrent requests. A request that loses a
 * race reads the camp again and is refused with the rule that now fails,
 * so the loser of a race for the last slot is told the hall is full. Before
 * any refusal the hero is read again, after the camp: a repeat of the same
 * request that won is what the camp shows, and its hero is the answer.
 *
 * The refusals, answered as data (`refusals.ts`): HallLevel, HallFull,
 * InsufficientResources (each material's amount and the camp's balance) and
 * Conflict, when the camp changed and no rule explains the failure. A
 * location the player has no camp at (locations.ts), or a unit type the
 * location does not recruit, is BAD_USER_INPUT; the request id is a
 * lower-case UUID by the time it arrives (`RecruitHeroInput`).
 */

export type Random = (max: number) => number;

function pick<T>(items: readonly T[], random: Random): T {
  const item = items[random(items.length)];
  if (item === undefined) throw new Error("pick from an empty list");
  return item;
}

/** The first rule the camp fails, in the order the hall shows them, or nothing if it fails none: the engine's rule (`recruitRefusal`), as this API's refusal. */
function barred(camp: Camp, recruit: Recruit): Refusal | undefined {
  const refusal = recruitRefusal(camp, recruit);
  if (!refusal) return undefined;
  switch (refusal.code) {
    case "HALL_LEVEL":
      return new HallLevel(refusal.message, refusal.hallLevel);
    case "HALL_FULL":
      return new HallFull(refusal.message);
    case "INSUFFICIENT_RESOURCES":
      return new InsufficientResources(refusal.message, refusal.short);
  }
}

/**
 * The hero this request made, if any. A request id reused for another unit
 * type or another location is the client's defect, not a repeat:
 * BAD_USER_INPUT, never the first request's hero (graphql.md, rule 7). The
 * location is compared with where the hero was recruited, which no write
 * changes, and not with where it is: a caravan moves a hero (decision 0059).
 */
function madeBy(hero: Hero | undefined, requestId: string, locationId: string, unitType: string): Hero | undefined {
  if (hero && hero.unitType !== unitType) badInput(`request ${requestId} recruited a ${hero.unitType}, not a ${unitType}`);
  if (hero && hero.recruitedIn !== locationId) badInput(`request ${requestId} recruited at ${hero.recruitedIn}, not at ${locationId}`);
  return hero;
}

export function recruitHero(
  repo: Repository,
  playerId: string,
  locationId: string,
  unitType: string,
  requestId: string,
  random: Random = randomInt,
  now = new Date(),
): Promise<Hero> {
  return retryingConflicts("recruit", "the camp changed while recruiting; no hero was recruited", () => recruitOnce(repo, playerId, locationId, unitType, requestId, random, now));
}

async function recruitOnce(repo: Repository, playerId: string, locationId: string, unitType: string, requestId: string, random: Random, now: Date): Promise<Hero> {
  const already = madeBy(await repo.getHero(playerId, requestId), requestId, locationId, unitType);
  if (already) return already;

  const at = await campLocation(repo, playerId, locationId);
  const recruit = at.recruits.find((r) => r.unitType === unitType);
  if (!recruit) badInput(`${at.name} does not recruit ${unitType}`);

  // A repeat of this request may make the hero after the read above, and the
  // camp then shows its recruit, so before any refusal the hero is read again,
  // after the camp: a hero by this request's id is the answer whatever the
  // camp says (graphql.md, rule 9).
  const camp = await repo.camp(playerId, at.id);
  const refusal = barred(camp, recruit);
  if (refusal) {
    const made = madeBy(await repo.getHero(playerId, requestId), requestId, locationId, unitType);
    if (made) return made;
    throw refusal;
  }
  const cost = recruitCost(recruit, camp.livingHeroes);
  // Only a villager's price depends on the living heroes, so only its transaction holds that count.
  const living = recruit.unitType !== "villager" ? "any" : camp.livingHeroes === 0 ? "none" : "some";

  // The name suits the sprite set and avoids the camp's living roster.
  const spriteSet = pick(SPRITE_SETS[recruit.unitType], random);
  const names = new Set((await repo.heroes(playerId)).filter((h) => h.location === at.id && h.status === "ALIVE").map((h) => h.name));

  const hero: Hero = {
    id: requestId,
    location: at.id,
    recruitedIn: at.id,
    unitType: recruit.unitType,
    spriteSet,
    name: pick(heroNames(SPRITE_SET_PRESENTATION[spriteSet] ?? "either", names), random),
    recruitedAt: now.toISOString(),
    level: 1,
    xp: 0,
    picks: [],
    status: "ALIVE",
    retiredAt: null,
    adventureId: null,
  };
  try {
    return await repo.recruit(playerId, camp, hallCapacity(camp.hallLevel), hero, cost, living);
  } catch (e) {
    // The transaction's own check of the unlock, which the read above passed: an unlock is never taken away, so nothing explains it but the read.
    if (e instanceof LocationLocked) refuseNoCamp(at.id);
    if (!(e instanceof HeroExists || e instanceof RecruitRefused || e instanceof InsufficientBalance)) throw e;
    // The camp first and the hero after it, as above: a repeat that won the race is the answer.
    const after = await repo.camp(playerId, at.id);
    const made = madeBy(await repo.getHero(playerId, requestId), requestId, locationId, unitType);
    if (made) return made;
    throw barred(after, recruit) ?? new Conflict("the camp changed while recruiting; no hero was recruited");
  }
}
