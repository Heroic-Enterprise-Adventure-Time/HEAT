import type { Context as LambdaContext } from "aws-lambda";
import { afterEach, beforeAll, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

import { event, type Handler, loadHandler } from "./event.js";

/**
 * What the log says of an error, through the handler: its text and the field
 * it was raised on, in one warning (graphql.md, rule 16). The text is under
 * `error`: the logger keeps `message` for the line's own and drops a key of
 * that name, which is how a deploy's log said that a request had failed and
 * not why (Issue-391).
 */

// Powertools' own way to read what a function logs: in dev mode it writes through the global console.
vi.hoisted(() => {
  process.env["POWERTOOLS_DEV"] = "true";
  process.env["POWERTOOLS_LOG_LEVEL"] = "WARN";
  process.env["POWERTOOLS_SERVICE_NAME"] = "heat-hub";
});

let handler: Handler;

beforeAll(async () => {
  handler = await loadHandler();
});

describe("the handler's log", () => {
  let warned: MockInstance<typeof console.warn>;

  beforeEach(() => {
    warned = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("says an error's text and its field in one warning", async () => {
    const res = await handler(event(`mutation { joinGame { __typename } }`), {} as LambdaContext);
    expect(JSON.parse(res.body ?? "{}")).toMatchObject({ errors: [{ extensions: { code: "UNAUTHENTICATED" } }] });

    const lines = warned.mock.calls.map(([line]) => JSON.parse(line as string) as Record<string, unknown>);
    expect(lines).toEqual([expect.objectContaining({ level: "WARN", message: "graphql error", error: "not signed in", path: ["joinGame"] })]);
  });
});
