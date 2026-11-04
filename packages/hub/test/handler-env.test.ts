import { afterEach, describe, expect, it, vi } from "vitest";

describe("the handler's environment", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("fails at import on a missing replay bucket, and names it", async () => {
    vi.stubEnv("HEAT_REPLAY_BUCKET", "");
    vi.resetModules();
    await expect(import("../src/handler.js")).rejects.toThrow("HEAT_REPLAY_BUCKET is not set");
  });
});
