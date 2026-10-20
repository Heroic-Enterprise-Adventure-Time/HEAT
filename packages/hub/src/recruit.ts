import { randomInt } from "node:crypto";
import { GraphQLError } from "graphql";
import {
  HERO_NAMES,
  SPRITE_SETS,
  STARTING_LOCATION,
  UNIT_TYPES,
  hallCapacity,
  location,
  type UnitType,
} from "@heat/engine";
import { HeroExists, RecruitRefused, TransactionConflict, type Hero, type Repository } from "./db/repository.js";

/**
 * Recruitment (decision 0026): the client names the unit type and a request
 * id, and the hub draws the rest. The request id becomes the hero id, so a
 * repeated request answers with the hero it already made. Only the free
 * villager is recruited here; paid recruitment is Issue-82.
 *
 * The rules are checked twice, on purpose: here, against the camp as read,
 * to give the player a reason; and in the transaction's condition, which is
 * what actually holds under concurrent requests.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Random = (max: number) => number;

function refuse(message: string, code: string): never {
  throw new GraphQLError(message, { extensions: { code } });
}

function pick<T>(items: readonly T[], random: Random): T {
  const item = items[random(items.length)];
  if (item === undefined) throw new Error("pick from an empty list");
  return item;
}

export async function recruitHero(
  repo: Repository,
  playerId: string,
  unitType: string,
  requestId: string,
  random: Random = randomInt,
  now = new Date(),
): Promise<Hero> {
  if (!UUID.test(requestId)) refuse("requestId must be a UUID", "BAD_USER_INPUT");
  const heroId = requestId.toLowerCase();
  const already = await repo.getHero(playerId, heroId);
  if (already) return already;

  const at = location(STARTING_LOCATION);
  const recruit = at?.recruits.find((r) => r.unitType === unitType);
  if (!at || !recruit || !UNIT_TYPES.includes(unitType as UnitType)) {
    refuse(`${at?.name ?? STARTING_LOCATION} does not recruit ${unitType}`, "BAD_USER_INPUT");
  }
  if (unitType !== "villager") refuse("only the free villager can be recruited yet", "NOT_AVAILABLE");

  const camp = await repo.camp(playerId, at.id);
  if (camp.livingHeroes > 0) refuse("the villager is free only when no hero at the camp is alive", "NOT_FREE");
  const capacity = hallCapacity(camp.hallLevel);
  if (camp.activeHeroes >= capacity) refuse("the heroes hall is full", "HALL_FULL");
  if (camp.hallLevel < recruit.hallLevel) refuse(`${unitType} needs a level ${recruit.hallLevel} hall`, "HALL_LEVEL");

  // Avoid the names on the camp's living roster; with more names than the
  // hall holds, there is always one left.
  const living = new Set((await repo.heroes(playerId)).filter((h) => h.location === at.id && h.status === "ALIVE").map((h) => h.name));
  const names = HERO_NAMES.filter((n) => !living.has(n));

  const hero: Hero = {
    id: heroId,
    location: at.id,
    unitType: recruit.unitType,
    spriteSet: pick(SPRITE_SETS[recruit.unitType], random),
    name: pick(names.length > 0 ? names : HERO_NAMES, random),
    recruitedAt: now.toISOString(),
    level: 1,
    xp: 0,
    picks: [],
    status: "ALIVE",
  };
  try {
    return await repo.recruitFree(playerId, camp, capacity, hero);
  } catch (e) {
    if (!(e instanceof HeroExists || e instanceof RecruitRefused || e instanceof TransactionConflict)) throw e;
    // A repeat of this request that raced this one made the hero: answer with it.
    const made = await repo.getHero(playerId, heroId);
    if (made) return made;
    refuse("the camp changed while recruiting; no hero was recruited", "CONFLICT");
  }
}
