import { GraphQLError } from "graphql";
import { HeroChanged, TransactionConflict, type Hero, type Repository } from "./db/repository.js";

/**
 * Retirement (docs/design/game.md, "The heroes hall"): permanent, and the
 * hero stays on the record with its history. A retired hero is not active,
 * so it frees a slot in the hall, and if it was alive it may leave the camp
 * with no living hero, which makes the next villager free.
 *
 * A hero already retired answers as it is, so a repeated request is
 * harmless. A request that loses a race reads the hero again: if the other
 * request retired it, that is the answer; anything else is a conflict.
 */

function refuse(message: string, code: string): never {
  throw new GraphQLError(message, { extensions: { code } });
}

export async function retireHero(repo: Repository, playerId: string, heroId: string, now = new Date()): Promise<Hero> {
  const hero = await repo.getHero(playerId, heroId.toLowerCase());
  if (!hero) refuse("no such hero", "NOT_FOUND");
  if (hero.status === "RETIRED") return hero;
  try {
    return await repo.retire(playerId, hero, now);
  } catch (e) {
    if (!(e instanceof HeroChanged || e instanceof TransactionConflict)) throw e;
    const after = await repo.getHero(playerId, hero.id);
    if (after?.status === "RETIRED") return after;
    refuse("the hero changed while retiring; nothing was retired", "CONFLICT");
  }
}
