import { randomInt } from "node:crypto";
import { setTimeout } from "node:timers/promises";

import { MetricUnit } from "@aws-lambda-powertools/metrics";
import { retry } from "es-toolkit";

import { TransactionConflict } from "./db/repository.js";
import { logger, metrics } from "./observability.js";
import { Conflict } from "./refusals.js";

/**
 * A TransactionConflict is retried by the caller (graphql.md, rule 18).
 * DynamoDB cancels a transaction that meets another one still committing,
 * and the SDK does not retry a cancelled transaction, so a read made at once
 * may not show the other's writes yet; the verb runs again after a backoff,
 * from its first read, and so answers what the other request did: the work
 * done, or the rule that now fails. A verb that still conflicts after
 * CONFLICT_ATTEMPTS runs answers Conflict. Every run again is a warning in
 * the log and a metric by verb, and every Conflict answered a metric the
 * alarm watches (decision 0040).
 */

/** The verbs that retry, the values of the metrics' `verb` dimension. */
type Verb = "build" | "discard" | "recruit" | "retire" | "settle" | "start";

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

/** A count for reading, written at once: on a metric of its own because a flush has one set of dimensions and a request may run two verbs. */
function countByVerb(metric: "ConflictAnswered" | "TransactionConflictRetry", verb: Verb): void {
  const single = metrics.singleMetric();
  single.addDimension("verb", verb);
  single.addMetric(metric, MetricUnit.Count, 1);
}

/** Notes the run again and answers how long to wait before it. */
function again(attempt: number, verb: Verb): number {
  logger.warn("transaction conflict; running again", { verb, attempt });
  countByVerb("TransactionConflictRetry", verb);
  return backoff(attempt);
}

/** Waits the backoff before run `attempt + 1` of a loop that re-reads itself, as settlement does. */
export function pause(attempt: number, verb: Verb): Promise<void> {
  return setTimeout(again(attempt, verb));
}

/**
 * Runs `work` and counts the Conflict it answers, the one place a Conflict is
 * counted: stored, by service alone, for the alarm, which must name a metric's
 * dimensions exactly and so cannot sum the verbs, and at once by verb. For a
 * verb that keeps its own loop, as settlement does; the others have it through
 * `retryingConflicts`.
 */
export async function countingConflicts<T>(verb: Verb, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof Conflict) {
      metrics.addMetric("ConflictAnswered", MetricUnit.Count, 1);
      countByVerb("ConflictAnswered", verb);
    }
    throw e;
  }
}

/** Runs `work`, again after a backoff on a TransactionConflict, and answers Conflict with `message` when it keeps conflicting. */
export function retryingConflicts<T>(verb: Verb, message: string, work: () => Promise<T>): Promise<T> {
  return countingConflicts(verb, async () => {
    try {
      // es-toolkit's retry (typescript.md, rule 17) counts attempts from zero and asks the delay only before a run that happens.
      return await retry(work, {
        retries: CONFLICT_ATTEMPTS - 1,
        shouldRetry: (e) => e instanceof TransactionConflict,
        delay: (attempts) => again(attempts + 1, verb),
      });
    } catch (e) {
      if (e instanceof TransactionConflict) throw new Conflict(message);
      throw e;
    }
  });
}
