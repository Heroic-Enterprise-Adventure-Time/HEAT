import { retryingConflicts } from "./conflict.js";
import { type Hero, HeroChanged, type Repository } from "./db/repository.js";
import { badInput, Conflict, HeroAdventuring } from "./refusals.js";

/**
 * Retirement (docs/design/game.md, "The heroes hall"): permanent, and the
 * hero stays on the record with its history. A retired hero is not active,
 * so it frees a slot in the hall, and if it was alive it may leave the camp
 * with no living hero, which makes the next villager free.
 *
 * A hero already retired answers as it is, so a repeated request is
 * harmless. A request that loses a race reads the hero again: if the other
 * request retired it, that is the answer; anything else is a Conflict.
 *
 * A hero on the open adventure cannot retire until the adventure is
 * settled: its party is in the snapshot, and settlement pays and buries
 * the heroes there. The transaction's condition holds that against a start
 * racing the retire, and the refusal is HeroAdventuring. A hero that is not
 * the player's is BAD_USER_INPUT: another player's is not said to exist.
 */

function refuseAdventuring(heroId: string): never {
  throw new HeroAdventuring("the hero is on an adventure; it can retire when the adventure is settled", heroId);
}

export function retireHero(repo: Repository, playerId: string, heroId: string, now = new Date()): Promise<Hero> {
  return retryingConflicts("retire", "the hero changed while retiring; nothing was retired", () => retireOnce(repo, playerId, heroId, now));
}

async function retireOnce(repo: Repository, playerId: string, heroId: string, now: Date): Promise<Hero> {
  const hero = await repo.getHero(playerId, heroId.toLowerCase());
  if (!hero) badInput("no such hero");
  if (hero.status === "RETIRED") return hero;
  if (hero.adventureId !== null) refuseAdventuring(hero.id);
  try {
    return await repo.retire(playerId, hero, now);
  } catch (e) {
    if (!(e instanceof HeroChanged)) throw e;
    const after = await repo.getHero(playerId, hero.id);
    if (after?.status === "RETIRED") return after;
    if (after?.adventureId) refuseAdventuring(hero.id);
    throw new Conflict("the hero changed while retiring; nothing was retired");
  }
}
