import { randomUUID } from "node:crypto";

import type { APIGatewayProxyEventV2WithJWTAuthorizer, Context as LambdaContext } from "aws-lambda";
import { afterEach, beforeAll, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

import { Repository, TransactionConflict } from "../src/db/repository.js";

/**
 * What the alarm reads, through the handler: a Conflict answered reaches the
 * log under the service alone, flushed by `logMetrics` at the end of the
 * request (typescript.md, rule 9; decision 0040). The repository stands in for
 * the race a test cannot time, by answering every retire with a
 * TransactionConflict.
 */

// Powertools' own way to read what a function emits: in dev mode with metrics on, it writes through the global console.
vi.hoisted(() => {
  process.env["POWERTOOLS_DEV"] = "true";
  process.env["POWERTOOLS_METRICS_DISABLED"] = "false";
  process.env["POWERTOOLS_METRICS_NAMESPACE"] = "heat-test";
  process.env["POWERTOOLS_SERVICE_NAME"] = "heat-hub";
});

type Handler = (event: APIGatewayProxyEventV2WithJWTAuthorizer, context: LambdaContext) => Promise<{ statusCode?: number; body?: string }>;

let handler: Handler;

beforeAll(async () => {
  // The handler reads its configuration at import time, as graphql.test.ts says.
  handler = (await import("../src/handler.js")).handler as unknown as Handler;
});

function event(query: string, variables: Record<string, unknown>, playerId: string): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    version: "2.0",
    routeKey: "POST /graphql",
    rawPath: "/graphql",
    rawQueryString: "",
    headers: { "content-type": "application/json" },
    requestContext: {
      accountId: "000000000000",
      apiId: "local",
      domainName: "localhost",
      domainPrefix: "local",
      http: { method: "POST", path: "/graphql", protocol: "HTTP/1.1", sourceIp: "127.0.0.1", userAgent: "vitest" },
      requestId: randomUUID(),
      routeKey: "POST /graphql",
      stage: "$default",
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
      authorizer: { principalId: playerId, integrationLatency: 0, jwt: { claims: { sub: playerId }, scopes: [] } },
    },
    body: JSON.stringify({ query, variables }),
    isBase64Encoded: false,
  };
}

async function call(query: string, variables: Record<string, unknown>, playerId: string): Promise<unknown> {
  const res = await handler(event(query, variables, playerId), {} as LambdaContext);
  return JSON.parse(res.body ?? "{}");
}

describe("the handler's metrics", () => {
  let emitted: MockInstance<typeof console.log>;

  beforeEach(() => {
    emitted = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("flushes a Conflict answered under the service alone", async () => {
    const player = `p-${randomUUID()}`;
    const id = randomUUID();
    await call(`mutation { joinGame { __typename } }`, {}, player);
    await call(`mutation($id: UUID!) { recruitHero(input: { unitType: VILLAGER, requestId: $id }) { __typename } }`, { id }, player);
    vi.spyOn(Repository.prototype, "retire").mockRejectedValue(new TransactionConflict("conflict"));
    emitted.mockClear();

    const answered = await call(`mutation($id: ID!) { retireHero(input: { heroId: $id }) { __typename } }`, { id }, player);
    expect(answered).toMatchObject({ data: { retireHero: { __typename: "Conflict" } } });

    const lines = emitted.mock.calls.map(([line]) => JSON.parse(line as string) as Record<string, unknown> & { _aws: { CloudWatchMetrics: { Dimensions: string[][] }[] } });
    const flushed = lines.filter((line) => line["ConflictAnswered"] !== undefined && line["verb"] === undefined);
    expect(flushed).toHaveLength(1);
    expect(flushed[0]).toMatchObject({ service: "heat-hub", ConflictAnswered: 1 });
    expect(flushed[0]?._aws.CloudWatchMetrics[0]?.Dimensions).toEqual([["service"]]);
  });
});
