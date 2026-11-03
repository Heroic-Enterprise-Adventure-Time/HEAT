import type { Repository } from "../src/db/repository.js";

/**
 * A race made deterministic (graphql.md, rule 20). Concurrent requests
 * interleave as the event loop and DynamoDB Local happen to order them, so a
 * test that only runs them together covers the windows it happens to hit.
 * Here the loser runs on a repository that lets the winner commit just
 * before the loser's k-th call on it; run for k = 1, 2, … until the winner
 * no longer gets in, a test covers every point between the loser's reads
 * and its write at which the winner can land.
 *
 * A call is counted as it starts. Where a verb makes calls together, as
 * start reads a party's heroes with `Promise.all`, the winner commits while
 * the calls before it are already in flight, and the point between those
 * calls is DynamoDB Local's timing again; a race over such calls uses a
 * party of one, so that no call runs beside another.
 */

/** The loser's repository, and whether the winner got in before the loser finished with it. */
export interface Race {
  repo: Repository;
  ran: () => boolean;
}

type Method = (...args: unknown[]) => Promise<unknown>;

/**
 * A repository whose calls run `before(call, name)` first, counting from 1;
 * a `before` that throws stands for the call failing.
 */
function watched(repo: Repository, before: (call: number, name: string) => Promise<void>): Repository {
  let calls = 0;
  return new Proxy(repo, {
    get: (target, key, receiver): unknown => {
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value !== "function") return value;
      return async (...args: unknown[]): Promise<unknown> => {
        await before(++calls, String(key));
        return (value as Method).apply(target, args);
      };
    },
  });
}

/** A repository on which `winner` runs to completion just before the k-th call, counting from 1. */
export function winnerBefore(repo: Repository, k: number, winner: () => Promise<unknown>): Race {
  let ran = false;
  const late = watched(repo, async (call) => {
    if (call !== k) return;
    await winner();
    ran = true;
  });
  return { repo: late, ran: () => ran };
}

/**
 * A repository whose first call to `method` fails with `error` and writes
 * nothing, as DynamoDB cancels a transaction that meets another still
 * committing, and on which `winner`, that other transaction, commits just
 * before the k-th call after the failure. A TransactionConflict is the one
 * failure sequential requests cannot produce, so this is how its tests make it.
 */
export function cancelled(repo: Repository, method: keyof Repository, error: Error, k: number, winner: () => Promise<unknown>): Race {
  let failedAt: number | undefined;
  let ran = false;
  const late = watched(repo, async (call, name) => {
    if (failedAt === undefined && name === method) {
      failedAt = call;
      throw error;
    }
    if (failedAt === undefined || call - failedAt !== k) return;
    await winner();
    ran = true;
  });
  return { repo: late, ran: () => ran };
}

/** More calls than any verb makes: a race still running past it is a test's mistake. */
const MOST_CALLS = 50;

/**
 * Runs `race(k)` for k = 1, 2, … until it answers that the winner did not
 * get in, and answers how many interleavings had the winner in them.
 */
export async function everyInterleaving(race: (k: number) => Promise<boolean>): Promise<number> {
  for (let k = 1; k <= MOST_CALLS; k++) {
    if (!(await race(k))) return k - 1;
  }
  throw new Error(`the winner still got in after ${MOST_CALLS} calls`);
}
