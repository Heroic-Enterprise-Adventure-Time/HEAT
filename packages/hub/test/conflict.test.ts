import { range } from "es-toolkit";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

import { backoff, BACKOFF_CAP_MS, CONFLICT_ATTEMPTS, countingConflicts, retryingConflicts } from "../src/conflict.js";
import { TransactionConflict } from "../src/db/repository.js";
import { logger, metrics } from "../src/observability.js";
import { Conflict } from "../src/refusals.js";
import { refusal } from "./refusal.js";

/** The retry of a TransactionConflict (graphql.md, rule 18), apart from any verb. */

// Powertools' own way to read what a function emits: in dev mode with metrics on, it writes through the global console.
vi.hoisted(() => {
  process.env["POWERTOOLS_DEV"] = "true";
  process.env["POWERTOOLS_METRICS_DISABLED"] = "false";
  process.env["POWERTOOLS_METRICS_NAMESPACE"] = "heat-test";
  process.env["POWERTOOLS_SERVICE_NAME"] = "heat-hub";
});

/** A verb that conflicts `times` times and then answers, counting its runs. */
function conflicting(times: number): { verb: () => Promise<string>; runs: () => number } {
  let runs = 0;
  const verb = (): Promise<string> => (++runs <= times ? Promise.reject(new TransactionConflict("conflict")) : Promise.resolve("done"));
  return { verb, runs: () => runs };
}

/** One EMF line: the namespace, the dimension sets, and the fields beside them. */
interface Emf {
  _aws: { CloudWatchMetrics: { Namespace: string; Dimensions: string[][]; Metrics: { Name: string; Unit: string }[] }[] };
  [field: string]: unknown;
}

describe("retryingConflicts", () => {
  let emitted: MockInstance<typeof console.log>;

  /** Flushes as the handler does and answers every line written since the test began. */
  function lines(): Emf[] {
    metrics.publishStoredMetrics();
    return emitted.mock.calls.map(([line]) => JSON.parse(line as string) as Emf);
  }

  beforeEach(() => {
    // What an earlier test stored and did not flush is not this test's.
    metrics.clearMetrics();
    emitted = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    emitted.mockRestore();
  });

  it("runs the verb again after a TransactionConflict and answers what it answers", async () => {
    const { verb, runs } = conflicting(CONFLICT_ATTEMPTS - 1);
    expect(await retryingConflicts("recruit", "changed", verb)).toBe("done");
    expect(runs()).toBe(CONFLICT_ATTEMPTS);
  });

  it("answers Conflict with the message when the verb conflicts on every run", async () => {
    const { verb, runs } = conflicting(CONFLICT_ATTEMPTS);
    const refused = await refusal(retryingConflicts("recruit", "the camp changed", verb));
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
    expect(await refusal(retryingConflicts("recruit", "changed", verb))).toBe(failure);
    expect(runs).toBe(1);
  });

  it("warns once per run again, naming the verb and the attempt", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    try {
      const { verb } = conflicting(CONFLICT_ATTEMPTS - 1);
      await retryingConflicts("recruit", "the camp changed", verb);
      expect(warn.mock.calls).toEqual(range(1, CONFLICT_ATTEMPTS).map((attempt) => ["transaction conflict; running again", { verb: "recruit", attempt }]));
    } finally {
      warn.mockRestore();
    }
  });

  it("counts each run again by verb alone", async () => {
    const { verb } = conflicting(CONFLICT_ATTEMPTS - 1);
    await retryingConflicts("retire", "the hero changed", verb);
    const emf = lines();
    const byVerb = emf.filter((line) => line["verb"] === "retire");
    expect(byVerb).toHaveLength(CONFLICT_ATTEMPTS - 1);
    expect(byVerb[0]).toMatchObject({ service: "heat-hub", TransactionConflictRetry: 1 });
    expect(byVerb[0]?._aws.CloudWatchMetrics[0]).toMatchObject({ Namespace: "heat-test", Dimensions: [["service", "verb"]], Metrics: [{ Name: "TransactionConflictRetry", Unit: "Count" }] });
    expect(emf).toHaveLength(CONFLICT_ATTEMPTS - 1);
  });

  it("counts a Conflict answered, whether it gave up here or the verb did", async () => {
    await refusal(retryingConflicts("build", "changed", conflicting(CONFLICT_ATTEMPTS).verb));
    await refusal(retryingConflicts("build", "changed", () => Promise.reject(new Conflict("changed"))));
    const emf = lines();
    expect(emf.filter((line) => line["verb"] === "build" && line["ConflictAnswered"] === 1)).toHaveLength(2);
    const stored = emf.at(-1);
    expect(stored?._aws.CloudWatchMetrics[0]?.Dimensions).toEqual([["service"]]);
    expect(stored).toMatchObject({ ConflictAnswered: [1, 1] });
    expect(stored).not.toHaveProperty("verb");
  });

  it("counts nothing when no run conflicts", async () => {
    expect(await retryingConflicts("recruit", "changed", conflicting(0).verb)).toBe("done");
    expect(lines()).toEqual([]);
  });

  it("counts the Conflict of a verb outside it", async () => {
    await refusal(countingConflicts("settle", () => Promise.reject(new Conflict("the camp kept changing"))));
    expect(lines().find((line) => line["verb"] === "settle")).toMatchObject({ ConflictAnswered: 1 });
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
