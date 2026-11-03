import { setTimeout } from "node:timers/promises";

import { TransactionConflict } from "./db/repository.js";
import { Conflict } from "./refusals.js";

/**
 * A TransactionConflict is retried by the caller (graphql.md, rule 18).
 * DynamoDB cancels a transaction that meets another one still committing,
 * so a read made at once may not show the other's writes yet; the verb runs
 * again after a pause, from its first read, and so answers what the other
 * request did: the work done, or the rule that now fails. A verb that still
 * conflicts after CONFLICT_ATTEMPTS runs answers Conflict.
 */

/** Runs of a verb before a TransactionConflict is answered with Conflict. */
export const CONFLICT_ATTEMPTS = 3;

/** The pause before the next run, longer each time: the other transaction is committing, which takes milliseconds. */
export function pause(attempt: number): Promise<void> {
  return setTimeout(25 * attempt);
}

/** Runs `verb`, again after a pause on a TransactionConflict, and answers Conflict with `message` when it keeps conflicting. */
export async function retryingConflicts<T>(message: string, verb: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt < CONFLICT_ATTEMPTS; attempt++) {
    try {
      return await verb();
    } catch (e) {
      if (!(e instanceof TransactionConflict)) throw e;
      await pause(attempt);
    }
  }
  try {
    return await verb();
  } catch (e) {
    if (e instanceof TransactionConflict) throw new Conflict(message);
    throw e;
  }
}
