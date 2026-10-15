import { randomUUID } from "node:crypto";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, Context as LambdaContext } from "aws-lambda";
import { beforeAll, describe, expect, it } from "vitest";
import { configFromEnv, createDocumentClient } from "../src/db/client.js";
import { Repository } from "../src/db/repository.js";

/**
 * Drives the Lambda handler with synthesized HTTP API (payload 2.0) events,
 * the shape API Gateway sends after its JWT authorizer has validated the
 * token and attached the claims. Rule 2 of decision 0009: the handler is a
 * plain function of an event, so the test calls it like Lambda would.
 */
type Handler = (event: APIGatewayProxyEventV2WithJWTAuthorizer, context: LambdaContext) => Promise<{
  statusCode?: number;
  body?: string;
}>;

let handler: Handler;
let repo: Repository;

beforeAll(async () => {
  // The handler reads its configuration at import time, after global setup
  // has set the environment, so it is imported here rather than at the top.
  handler = (await import("../src/handler.js")).handler as unknown as Handler;
  const config = configFromEnv();
  repo = new Repository(createDocumentClient(config), config.tableName);
});

function event(query: string, variables: Record<string, unknown> = {}, playerId?: string): APIGatewayProxyEventV2WithJWTAuthorizer {
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
      authorizer: playerId
        ? { principalId: playerId, integrationLatency: 0, jwt: { claims: { sub: playerId }, scopes: [] } }
        : (undefined as unknown as APIGatewayProxyEventV2WithJWTAuthorizer["requestContext"]["authorizer"]),
    },
    body: JSON.stringify({ query, variables }),
    isBase64Encoded: false,
  };
}

async function gql<T = unknown>(query: string, variables: Record<string, unknown> = {}, playerId?: string) {
  const res = await handler(event(query, variables, playerId), {} as LambdaContext);
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body ?? "{}") as { data?: T; errors?: { message: string; path?: (string | number)[] }[] };
}

describe("authorization at the field level", () => {
  it("serves public fields to anyone and private fields only to the owner", async () => {
    const owner = `p-${randomUUID()}`;
    const other = `p-${randomUUID()}`;
    await repo.putPlayer({ id: owner, name: "Owner" });
    await repo.setBalance(owner, "timber", 5);

    const q = `query($id: String!) { player(id: $id) { id name holdings { material balance } } }`;

    const asOther = await gql<{ player: { name: string; holdings: unknown } }>(q, { id: owner }, other);
    expect(asOther.data?.player.name).toBe("Owner");
    expect(asOther.data?.player.holdings).toBeNull();
    expect(asOther.errors?.[0]?.path).toEqual(["player", "holdings"]);

    const asOwner = await gql<{ player: { holdings: { material: string; balance: number }[] } }>(q, { id: owner }, owner);
    expect(asOwner.errors).toBeUndefined();
    expect(asOwner.data?.player.holdings).toEqual([{ material: "timber", balance: 5 }]);

    const anonymous = await gql<{ me: unknown }>(`{ me { id } }`);
    expect(anonymous.data?.me).toBeNull();
    expect(anonymous.errors?.[0]?.path).toEqual(["me"]);
  });
});

describe("the adventure loop through the graph", () => {
  it("starts once, refuses a second start, settles with the engine's rewards, and refuses a second settle", async () => {
    const p = `p-${randomUUID()}`;
    await repo.putPlayer({ id: p, name: "Eve" });

    const start = await gql<{ startAdventure: { id: string; seed: string } }>(`mutation { startAdventure { id seed } }`, {}, p);
    expect(start.errors).toBeUndefined();
    const adventureId = start.data!.startAdventure.id;

    const again = await gql(`mutation { startAdventure { id } }`, {}, p);
    expect(again.errors?.[0]?.message).toMatch(/condition failed/);

    const settle = await gql<{ settleAdventure: { holdings: { material: string; balance: number }[] } }>(
      `mutation($id: String!) { settleAdventure(adventureId: $id) { holdings { material balance } } }`,
      { id: adventureId },
      p,
    );
    expect(settle.errors).toBeUndefined();
    const holdings = settle.data!.settleAdventure.holdings;
    expect(holdings.length).toBeGreaterThan(0);
    for (const h of holdings) expect(h.balance).toBeGreaterThan(0);

    const redelivered = await gql(
      `mutation($id: String!) { settleAdventure(adventureId: $id) { id } }`,
      { id: adventureId },
      p,
    );
    expect(redelivered.errors?.[0]?.message).toMatch(/condition failed/);
    expect(await repo.holdings(p)).toEqual(expect.arrayContaining(holdings));
  });
});
