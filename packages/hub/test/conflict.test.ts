import { describe, expect, it } from "vitest";

import { CONFLICT_ATTEMPTS, retryingConflicts } from "../src/conflict.js";
import { TransactionConflict } from "../src/db/repository.js";
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
});
