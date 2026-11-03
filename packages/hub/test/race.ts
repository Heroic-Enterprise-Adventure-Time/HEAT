import type { Repository } from "../src/db/repository.js";

/**
 * A race made deterministic (graphql.md, rule 20). Concurrent requests
 * interleave as the event loop and DynamoDB Local happen to order them, so a
 * test that only runs them together covers the windows it happens to hit.
 * Here the loser runs on a repository that lets the winner commit just
 * before the loser's k-th call on it; run for k = 1, 2, … until the winner
 * no longer gets in, a test covers every point between the loser's reads
 * and its write at which the winner can land.
 */

/** The loser's repository, and whether the winner got in before the loser finished with it. */
export interface Race {
  repo: Repository;
  ran: () => boolean;
}

/** A repository on which `winner` runs to completion just before the k-th call, counting from 1. */
export function winnerBefore(repo: Repository, k: number, winner: () => Promise<unknown>): Race {
  let calls = 0;
  let ran = false;
  const late = new Proxy(repo, {
    get: (target, key, receiver): unknown => {
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value !== "function") return value;
      return async (...args: unknown[]): Promise<unknown> => {
        if (++calls === k) {
          await winner();
          ran = true;
        }
        return (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
      };
    },
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
