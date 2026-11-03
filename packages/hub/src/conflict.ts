import { randomInt } from "node:crypto";
import { setTimeout } from "node:timers/promises";

import { retry } from "es-toolkit";

import { TransactionConflict } from "./db/repository.js";
import { logger } from "./observability.js";
import { Conflict } from "./refusals.js";

/**
 * A TransactionConflict is retried by the caller (graphql.md, rule 18).
 * DynamoDB cancels a transaction that meets another one still committing,
 * and the SDK does not retry a cancelled transaction, so a read made at once
 * may not show the other's writes yet; the verb runs again after a backoff,
 * from its first read, and so answers what the other request did: the work
 * done, or the rule that now fails. A verb that still conflicts after
 * CONFLICT_ATTEMPTS runs answers Conflict. Every run again is a warning in
 * the log: the conflict rate is what says whether the window "Held back" in
 * graphql.md describes is ever hit.
 */

/** Runs of a verb before a TransactionConflict is answered with Conflict. */
export const CONFLICT_ATTEMPTS = 3;

/** The longest wait before the first run again, in milliseconds; the cap doubles each attempt. */
export const BACKOFF_CAP_MS = 50;

/**
 * Exponential backoff with full jitter, the form AWS recommends between
 * concurrent clients ("Error retries and exponential backoff", DynamoDB
 * developer guide): a wait drawn from zero up to a cap that doubles each
 * attempt, up to 50 ms then up to 100 ms, the SDK's own schedule.
 */
export function backoff(attempt: number): number {
  return randomInt(BACKOFF_CAP_MS * 2 ** (attempt - 1));
}

/** Notes the run again and answers how long to wait before it. */
function again(attempt: number, what: string): number {
  logger.warn("transaction conflict; running again", { what, attempt });
  return backoff(attempt);
}

/** Waits the backoff before run `attempt + 1` of a loop that re-reads itself, as settlement does. */
export function pause(attempt: number, what: string): Promise<void> {
  return setTimeout(again(attempt, what));
}

/** Runs `verb`, again after a backoff on a TransactionConflict, and answers Conflict with `message` when it keeps conflicting. */
export async function retryingConflicts<T>(message: string, verb: () => Promise<T>): Promise<T> {
  try {
    // es-toolkit's retry (typescript.md, rule 17) counts attempts from zero and asks the delay only before a run that happens.
    return await retry(verb, {
      retries: CONFLICT_ATTEMPTS - 1,
      shouldRetry: (e) => e instanceof TransactionConflict,
      delay: (attempts) => again(attempts + 1, message),
    });
  } catch (e) {
    if (e instanceof TransactionConflict) throw new Conflict(message);
    throw e;
  }
}
