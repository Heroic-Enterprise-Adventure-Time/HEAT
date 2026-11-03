import { range } from "es-toolkit";
import { describe, expect, it, vi } from "vitest";

import { backoff, BACKOFF_CAP_MS, CONFLICT_ATTEMPTS, retryingConflicts } from "../src/conflict.js";
import { TransactionConflict } from "../src/db/repository.js";
import { logger } from "../src/observability.js";
import { Conflict } from "../src/refusals.js";
import { refusal } from "./refusal.js";

/** The retry of a TransactionConflict (graphql.md, rule 18), apart from any verb. */

/** A verb that conflicts `times` times and then answers, counting its runs. */
function conflicting(times: number): { verb: () => Promise<string>; runs: () => number } {
  let runs = 0;
  const verb = (): Promise<string> => (++runs <= times ? Promise.reject(new TransactionConflict("conflict")) : Promise.resolve("done"));
  return { verb, runs: () => runs };
}

describe("retryingConflicts", () => {
  it("runs the verb again after a TransactionConflict and answers what it answers", async () => {
    const { verb, runs } = conflicting(CONFLICT_ATTEMPTS - 1);
    expect(await retryingConflicts("changed", verb)).toBe("done");
    expect(runs()).toBe(CONFLICT_ATTEMPTS);
  });

  it("answers Conflict with the message when the verb conflicts on every run", async () => {
    const { verb, runs } = conflicting(CONFLICT_ATTEMPTS);
    const refused = await refusal(retryingConflicts("the camp changed", verb));
    expect(refused).toBeInstanceOf(Conflict);
    expect(refused).toMatchObject({ message: "the camp changed" });
    expect(runs()).toBe(CONFLICT_ATTEMPTS);
  });

  it("lets any other failure out at once", async () => {
    let runs = 0;
    const failure = new Error("the store is down");
    const verb = (): Promise<never> => {
      runs++;
      return Promise.reject(failure);
    };
    expect(await refusal(retryingConflicts("changed", verb))).toBe(failure);
    expect(runs).toBe(1);
  });

  it("warns once per run again, naming the verb and the attempt", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    try {
      const { verb } = conflicting(CONFLICT_ATTEMPTS - 1);
      await retryingConflicts("the camp changed", verb);
      expect(warn.mock.calls).toEqual(range(1, CONFLICT_ATTEMPTS).map((attempt) => ["transaction conflict; running again", { what: "the camp changed", attempt }]));
    } finally {
      warn.mockRestore();
    }
  });
});

describe("backoff", () => {
  it("draws a wait from zero up to a cap that doubles each attempt", () => {
    for (const attempt of [1, 2, 3]) {
      const cap = BACKOFF_CAP_MS * 2 ** (attempt - 1);
      const waits = range(200).map(() => backoff(attempt));
      expect(Math.min(...waits)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...waits)).toBeLessThan(cap);
      // Full jitter: the draws spread over the range rather than sitting on one value.
      expect(new Set(waits).size).toBeGreaterThan(cap / 4);
    }
  });
});
