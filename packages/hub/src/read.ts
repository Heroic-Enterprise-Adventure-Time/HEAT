import type { AdventureRecord, Repository } from "./db/repository.js";

/**
 * An adventure by id, as `adventure(id)` answers it (graphql.md, rules 8 and
 * 11): any settled one, for its replay, and an open or discarded one only
 * for the player whose it is. Anything else is undefined, the same answer as
 * no adventure, so the field does not say whether another player's open one
 * exists.
 */
export async function readAdventure(repo: Repository, playerId: string, adventureId: string): Promise<AdventureRecord | undefined> {
  const adventure = await repo.getAdventure(adventureId);
  return adventure?.status === "SETTLED" || adventure?.playerId === playerId ? adventure : undefined;
}
