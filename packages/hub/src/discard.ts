import { AdventureClosed, type AdventureRecord, HeroChanged, type Repository, TransactionConflict } from "./db/repository.js";
import { AdventureSettled, AdventureVerifiable, Conflict } from "./refusals.js";
import { ownAdventure } from "./submit.js";

/**
 * Discarding an adventure no deploy can verify any more (decision 0030): the
 * client asks for it when the current route and the previous route both
 * refuse the submit with EngineUpdated. The open item is cleared, the
 * record marked discarded, the party's marks removed, and nothing credited.
 *
 * An adventure that this deploy or the previous one issued is refused with
 * AdventureVerifiable: it can still be submitted, and a player who dislikes
 * how a run is going must finish it (game.md, "The adventure loop"). Without
 * the refusal a discard would also undo a death. The previous deploy's
 * version reaches the function as HEAT_PREVIOUS_VERSION, read by Terraform
 * when it planned the deploy (terraform/modules/environment/previous.tf).
 *
 * A discarded adventure answers as it is, so a repeat is harmless; a settled
 * one is refused with AdventureSettled. A discard that loses a race reads
 * the record again and answers the same way; Conflict when it is still open
 * and nothing explains the failure (graphql.md, rule 9).
 */
export async function discardAdventure(
  repo: Repository,
  playerId: string,
  versions: { current: string; previous: string | undefined },
  adventureId: string,
  now = new Date(),
): Promise<AdventureRecord> {
  const record = await ownAdventure(repo, playerId, adventureId);
  if (record.status === "DISCARDED") return record;
  if (record.status === "SETTLED") throw new AdventureSettled("the adventure is settled");
  if (record.version === versions.current || record.version === versions.previous) {
    throw new AdventureVerifiable("the adventure can still be submitted", record.version);
  }
  try {
    await repo.discard(playerId, record, now);
  } catch (e) {
    if (!(e instanceof AdventureClosed || e instanceof HeroChanged || e instanceof TransactionConflict)) throw e;
    const after = await repo.getAdventure(adventureId);
    if (after?.status === "DISCARDED") return after;
    if (after?.status === "SETTLED") throw new AdventureSettled("the adventure is settled");
    throw new Conflict("the adventure changed while discarding; nothing was discarded");
  }
  return { ...record, status: "DISCARDED", discardedAt: now.toISOString() };
}
