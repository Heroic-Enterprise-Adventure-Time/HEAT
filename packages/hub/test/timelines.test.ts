import { describe, expect, it } from "vitest";

import { replayBucketFromEnv } from "../src/timelines.js";

describe("the replay bucket's variable", () => {
  it("is read from the environment", () => {
    expect(replayBucketFromEnv({ HEAT_REPLAY_BUCKET: "replays" })).toBe("replays");
  });

  it("fails when it is unset, and names it", () => {
    expect(() => replayBucketFromEnv({})).toThrow("HEAT_REPLAY_BUCKET is not set");
  });

  it("fails when it is empty, and names it", () => {
    expect(() => replayBucketFromEnv({ HEAT_REPLAY_BUCKET: "" })).toThrow("HEAT_REPLAY_BUCKET is not set");
  });
});
