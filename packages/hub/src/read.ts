import { type Job, jobOf } from "@heat/engine";

import type { AdventureRecord, Repository } from "./db/repository.js";
import type { Timelines } from "./timelines.js";

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

/**
 * The player's open adventure, whole, or undefined when none is open: the
 * pointer the player's item holds, then the record it names (graphql.md,
 * rule 8).
 */
export async function readOpenAdventure(repo: Repository, playerId: string): Promise<AdventureRecord | undefined> {
  const open = await repo.openAdventure(playerId);
  return open ? repo.getAdventure(open.adventureId) : undefined;
}

/**
 * The timeline the hub's replay stored for a settled adventure, as the JSON
 * it was written as, or undefined: an adventure not settled has none, and
 * the store is not asked.
 */
export async function readTimeline(timelines: Timelines, adventure: AdventureRecord): Promise<unknown> {
  if (adventure.status !== "SETTLED") return undefined;
  const body = await timelines.get(adventure.adventureId);
  return body === undefined ? undefined : (JSON.parse(body) as unknown);
}

/**
 * The job an adventure names, or its line in a location's feed. A job this
 * version's content does not hold means the adventure is another version's,
 * which no player's action explains, so it is a failure in `errors` with no
 * code of its own, and not a refusal (graphql.md, rule 6).
 */
export function jobOfAdventure(adventure: { jobId: string }): Job {
  const job = jobOf(adventure.jobId);
  if (!job) throw new Error(`no job ${adventure.jobId} in this version`);
  return job;
}
