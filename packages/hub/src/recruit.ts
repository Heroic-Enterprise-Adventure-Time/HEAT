import { randomInt } from "node:crypto";

import {
  hallCapacity,
  heroNames,
  location,
  type Recruit,
  recruitCost,
  SPRITE_SET_PRESENTATION,
  SPRITE_SETS,
  STARTING_LOCATION,
  UNIT_TYPES,
  type UnitType,
} from "@heat/engine";

import { retryingConflicts } from "./conflict.js";
import {
  type Camp,
  type Hero,
  HeroExists,
  InsufficientBalance,
  RecruitRefused,
  type Repository,
} from "./db/repository.js";
import { badInput, Conflict, HallFull, HallLevel, InsufficientResources, type Refusal } from "./refusals.js";

/**
 * Recruitment (decision 0026): the client names the unit type and a request
 * id, and the hub draws the rest. The request id becomes the hero id, so a
 * repeated request answers with the hero it already made. Any unit type on
 * the location's list can be recruited at its hall level, paid in resources;
 * the villager is free when no hero at the camp is alive (`recruitCost`).
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
 * request id that is not a UUID, or a unit type the location does not
 * recruit, is BAD_USER_INPUT.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Random = (max: number) => number;

function pick<T>(items: readonly T[], random: Random): T {
  const item = items[random(items.length)];
  if (item === undefined) throw new Error("pick from an empty list");
  return item;
}

/** The first rule the camp fails, in the order the hall shows them, or nothing if it fails none. */
function barred(camp: Camp, recruit: Recruit): Refusal | undefined {
  if (camp.hallLevel < recruit.hallLevel) return new HallLevel(`a ${recruit.unitType} needs a level ${recruit.hallLevel} hall`, recruit.hallLevel);
  if (camp.activeHeroes >= hallCapacity(camp.hallLevel)) return new HallFull("the heroes hall is full");
  const short = recruitCost(recruit, camp.livingHeroes)
    .map(({ material, amount }) => ({ material, amount, balance: camp.holdings.find((h) => h.material === material)?.balance ?? 0 }))
    .filter((s) => s.balance < s.amount);
  if (short.length > 0) {
    const words = short.map((s) => `${s.amount} ${s.material}, and the camp has ${s.balance}`).join("; ");
    return new InsufficientResources(`a ${recruit.unitType} costs ${words}`, short);
  }
  return undefined;
}

/**
 * The hero this request made, if any. A request id reused for another unit
 * type is the client's defect, not a repeat: BAD_USER_INPUT, never the
 * first request's hero (graphql.md, rule 7).
 */
function madeBy(hero: Hero | undefined, requestId: string, unitType: string): Hero | undefined {
  if (hero && hero.unitType !== unitType) badInput(`request ${requestId} recruited a ${hero.unitType}, not a ${unitType}`);
  return hero;
}

export function recruitHero(
  repo: Repository,
  playerId: string,
  unitType: string,
  requestId: string,
  random: Random = randomInt,
  now = new Date(),
): Promise<Hero> {
  return retryingConflicts("recruit", "the camp changed while recruiting; no hero was recruited", () => recruitOnce(repo, playerId, unitType, requestId, random, now));
}

async function recruitOnce(repo: Repository, playerId: string, unitType: string, requestId: string, random: Random, now: Date): Promise<Hero> {
  if (!UUID.test(requestId)) badInput("requestId must be a UUID");
  const heroId = requestId.toLowerCase();
  const already = madeBy(await repo.getHero(playerId, heroId), requestId, unitType);
  if (already) return already;

  const at = location(STARTING_LOCATION);
  const recruit = at?.recruits.find((r) => r.unitType === unitType);
  if (!at || !recruit || !UNIT_TYPES.includes(unitType as UnitType)) {
    badInput(`${at?.name ?? STARTING_LOCATION} does not recruit ${unitType}`);
  }

  // A repeat of this request may make the hero after the read above, and the
  // camp then shows its recruit, so before any refusal the hero is read again,
  // after the camp: a hero by this request's id is the answer whatever the
  // camp says (graphql.md, rule 9).
  const camp = await repo.camp(playerId, at.id);
  const refusal = barred(camp, recruit);
  if (refusal) {
    const made = madeBy(await repo.getHero(playerId, heroId), requestId, unitType);
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
    id: heroId,
    location: at.id,
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
    if (!(e instanceof HeroExists || e instanceof RecruitRefused || e instanceof InsufficientBalance)) throw e;
    // The camp first and the hero after it, as above: a repeat that won the race is the answer.
    const after = await repo.camp(playerId, at.id);
    const made = madeBy(await repo.getHero(playerId, heroId), requestId, unitType);
    if (made) return made;
    throw barred(after, recruit) ?? new Conflict("the camp changed while recruiting; no hero was recruited");
  }
}
