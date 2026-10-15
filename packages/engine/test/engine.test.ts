import { describe, expect, it } from "vitest";
import { rewardsForSeed, rng, seedToNumber } from "../src/index.js";

describe("engine", () => {
  it("is deterministic for a seed", () => {
    expect(rewardsForSeed("adventure-1")).toEqual(rewardsForSeed("adventure-1"));
    expect(rewardsForSeed("adventure-1")).not.toEqual(rewardsForSeed("adventure-2"));
  });

  it("produces the same sequence for the same numeric seed", () => {
    const a = rng(42);
    const b = rng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("hashes seeds stably", () => {
    expect(seedToNumber("x")).toBe(seedToNumber("x"));
    expect(seedToNumber("x")).not.toBe(seedToNumber("y"));
  });
});
