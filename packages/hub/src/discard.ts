import { retryingConflicts } from "./conflict.js";
import { AdventureClosed, type AdventureRecord, CampChanged, type CaravanReturn, HeroChanged, type Repository } from "./db/repository.js";
import { AdventureSettled, AdventureVerifiable, Conflict } from "./refusals.js";
import { cappedCredits, ownAdventure, SETTLE_ATTEMPTS } from "./submit.js";

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
 *
 * A caravan's cargo goes back to the origin's warehouse up to its cap, as a
 * settlement's credits do, and what the cap turns away is lost; the slots
 * held at its destination are let go (decision 0059). A balance that moves
 * between the read and the write is read again, up to SETTLE_ATTEMPTS
 * times, as settlement does.
 */
export function discardAdventure(
  repo: Repository,
  playerId: string,
  versions: { current: string; previous: string | undefined },
  adventureId: string,
  now = new Date(),
): Promise<AdventureRecord> {
  return retryingConflicts("discard", "the adventure changed while discarding; nothing was discarded", () => discardOnce(repo, playerId, versions, adventureId, now));
}

async function discardOnce(
  repo: Repository,
  playerId: string,
  versions: { current: string; previous: string | undefined },
  adventureId: string,
  now: Date,
): Promise<AdventureRecord> {
  const record = await ownAdventure(repo, playerId, adventureId);
  if (record.status === "DISCARDED") return record;
  if (record.status === "SETTLED") throw new AdventureSettled("the adventure is settled");
  if (record.version === versions.current || record.version === versions.previous) {
    throw new AdventureVerifiable("the adventure can still be submitted", record.version);
  }
  for (let attempt = 0; attempt < SETTLE_ATTEMPTS; attempt++) {
    try {
      await repo.discard(playerId, record, now, await caravanReturn(repo, playerId, record));
      return { ...record, status: "DISCARDED", discardedAt: now.toISOString() };
    } catch (e) {
      // A balance or the warehouse moved since the read: read the camp again. A TransactionConflict runs the verb again (conflict.ts).
      if (e instanceof CampChanged) continue;
      if (!(e instanceof AdventureClosed || e instanceof HeroChanged)) throw e;
      const after = await repo.getAdventure(adventureId);
      if (after?.status === "DISCARDED") return after;
      if (after?.status === "SETTLED") throw new AdventureSettled("the adventure is settled");
      throw new Conflict("the adventure changed while discarding; nothing was discarded");
    }
  }
  throw new Conflict("the camp kept changing while discarding; nothing was discarded");
}

/** A caravan's cargo as it goes home, from the origin camp read now; nothing for any other job. */
async function caravanReturn(repo: Repository, playerId: string, record: AdventureRecord): Promise<CaravanReturn | undefined> {
  if (!record.caravan) return undefined;
  const camp = await repo.camp(playerId, record.location);
  const balances = new Map(camp.holdings.map((h) => [h.material, h.balance]));
  return { warehouseLevel: camp.warehouseLevel, stored: camp.stored, returns: cappedCredits(record.caravan.cargo, camp.warehouseLevel, balances) };
}
