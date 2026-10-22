import { GraphQLError } from "graphql";
import { AdventureClosed, type AdventureRecord, type Repository } from "./db/repository.js";
import { ownAdventure } from "./submit.js";

/**
 * Discarding an adventure no deploy can verify any more (decision 0030): the
 * client asks for it when the current route and the previous route both
 * refuse the submit with ENGINE_UPDATED. The open item is cleared, the
 * record marked discarded, the party's marks removed, and nothing credited.
 *
 * An adventure that this deploy or the previous one issued is refused with
 * ADVENTURE_VERIFIABLE: it can still be submitted, and a player who dislikes
 * how a run is going must finish it (game.md, "The adventure loop"). Without
 * the refusal a discard would also undo a death. The previous deploy's
 * version reaches the function as HEAT_PREVIOUS_VERSION, read by Terraform
 * when it planned the deploy (terraform/modules/environment/previous.tf).
 *
 * A discarded adventure answers as it is, so a repeat is harmless; a settled
 * one is refused.
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
  if (record.status === "SETTLED") {
    throw new GraphQLError("the adventure is settled", { extensions: { code: "ADVENTURE_SETTLED" } });
  }
  if (record.version === versions.current || record.version === versions.previous) {
    throw new GraphQLError("the adventure can still be submitted", {
      extensions: { code: "ADVENTURE_VERIFIABLE", version: record.version },
    });
  }
  try {
    await repo.discard(playerId, record, now);
  } catch (e) {
    if (!(e instanceof AdventureClosed)) throw e;
    const after = await repo.getAdventure(adventureId);
    if (after?.status === "DISCARDED") return after;
    throw new GraphQLError("the adventure is settled", { extensions: { code: "ADVENTURE_SETTLED" } });
  }
  return { ...record, status: "DISCARDED", discardedAt: now.toISOString() };
}
