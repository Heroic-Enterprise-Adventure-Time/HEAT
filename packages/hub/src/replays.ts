import type { AdventureRecord, Repository } from "./db/repository.js";

/**
 * The replays of a job (decision 0050): its settled adventures, every outcome,
 * read through the location table's index, which holds a record from
 * settlement on and never an open or discarded one. What is answered is the
 * record itself, as `adventure(id)` answers a settled one to any signed-in
 * player: the record keeps its player's id for the hub's own checks, and no
 * field serves it (decision 0043).
 */

/** Records one read of a job's replays takes, at most. */
export const REPLAYS_READ = 20;

/**
 * The adventures most recently settled for the job, newest first, from one
 * read of at most REPLAYS_READ records. The index is eventually consistent,
 * so an adventure settled a moment ago may not be in the answer yet. Nothing
 * settled before the index existed is in it: no record was backfilled.
 */
export function replaysOf(repo: Repository, jobId: string): Promise<AdventureRecord[]> {
  return repo.replays(jobId, REPLAYS_READ);
}
