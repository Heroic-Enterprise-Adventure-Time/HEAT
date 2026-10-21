import { randomUUID } from "node:crypto";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, Context as LambdaContext } from "aws-lambda";
import { beforeAll, describe, expect, it } from "vitest";
import { rewardsForSeed } from "@heat/engine";
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
  repo = new Repository(createDocumentClient(config), config.tables);
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
    await repo.setBalance(owner, "millbrook", "timber", 5);

    const q = `query($id: String!) { player(id: $id) { id name camps { location holdings { material balance } } heroes { id } } }`;

    const asOther = await gql<{ player: { name: string; camps: unknown; heroes: unknown } }>(q, { id: owner }, other);
    expect(asOther.data?.player.name).toBe("Owner");
    expect(asOther.data?.player.camps).toBeNull();
    expect(asOther.data?.player.heroes).toBeNull();
    expect(asOther.errors?.map((e) => e.path)).toEqual(expect.arrayContaining([["player", "camps"], ["player", "heroes"]]));

    const asOwner = await gql<{ player: { camps: { location: string; holdings: { material: string; balance: number }[] }[] } }>(q, { id: owner }, owner);
    expect(asOwner.errors).toBeUndefined();
    expect(asOwner.data?.player.camps).toEqual([{ location: "millbrook", holdings: [{ material: "timber", balance: 5 }] }]);

    const anonymous = await gql<{ me: unknown }>(`{ me { id } }`);
    expect(anonymous.data?.me).toBeNull();
    expect(anonymous.errors?.[0]?.path).toEqual(["me"]);
  });
});

describe("first sign-in", () => {
  it("makes the profile once, with joinGame, and starting an adventure no longer does", async () => {
    const p = `p-${randomUUID()}`;
    await gql(`mutation { startAdventure { id } }`, {}, p);
    expect(await repo.getPlayer(p)).toBeUndefined();

    const joined = await gql<{ joinGame: { id: string; name: string } }>(`mutation { joinGame { id name } }`, {}, p);
    expect(joined.errors).toBeUndefined();
    // No email claim in the synthesized token, so the name falls back to the subject.
    expect(joined.data?.joinGame).toEqual({ id: p, name: p });

    await repo.putPlayer({ id: p, name: "Renamed in the table" });
    const again = await gql<{ joinGame: { name: string } }>(`mutation { joinGame { name } }`, {}, p);
    expect(again.data?.joinGame.name).toBe("Renamed in the table");
  });
});

describe("the camp through the graph", () => {
  it("shows a new player the starting camp, recruits the free villager, and refuses a second", async () => {
    const p = `p-${randomUUID()}`;
    await gql(`mutation { joinGame { id } }`, {}, p);
    const camp = `{ me { camps { location name hallLevel heroCapacity resourceCapacity activeHeroes livingHeroes } heroes { id name unitType spriteSet status } } }`;

    const before = await gql<{ me: { camps: unknown[]; heroes: unknown[] } }>(camp, {}, p);
    expect(before.data?.me).toEqual({
      camps: [{ location: "millbrook", name: "Millbrook", hallLevel: 1, heroCapacity: 4, resourceCapacity: 100, activeHeroes: 0, livingHeroes: 0 }],
      heroes: [],
    });

    const requestId = randomUUID();
    const recruit = `mutation($id: String!) { recruitHero(unitType: "villager", requestId: $id) { id name unitType spriteSet status } }`;
    const made = await gql<{ recruitHero: { id: string; unitType: string; status: string } }>(recruit, { id: requestId }, p);
    expect(made.errors).toBeUndefined();
    expect(made.data?.recruitHero).toMatchObject({ id: requestId, unitType: "villager", status: "ALIVE" });

    const after = await gql<{ me: { camps: { activeHeroes: number }[]; heroes: unknown[] } }>(camp, {}, p);
    expect(after.data?.me.camps[0]?.activeHeroes).toBe(1);
    expect(after.data?.me.heroes).toEqual([made.data?.recruitHero]);

    const second = await gql(recruit, { id: randomUUID() }, p);
    expect((second.errors?.[0] as { extensions?: { code?: string } } | undefined)?.extensions?.code).toBe("NOT_FREE");
  });

  it("retires the villager, which frees the next villager", async () => {
    const p = `p-${randomUUID()}`;
    await gql(`mutation { joinGame { id } }`, {}, p);
    const recruit = `mutation($id: String!) { recruitHero(unitType: "villager", requestId: $id) { id } }`;
    const retire = `mutation($id: String!) { retireHero(heroId: $id) { id status retiredAt } }`;
    const id = randomUUID();
    await gql(recruit, { id }, p);

    const retired = await gql<{ retireHero: { id: string; status: string; retiredAt: string | null } }>(retire, { id }, p);
    expect(retired.errors).toBeUndefined();
    expect(retired.data?.retireHero).toMatchObject({ id, status: "RETIRED" });
    expect(retired.data?.retireHero.retiredAt).toEqual(expect.any(String));

    const counts = await gql<{ me: { camps: unknown[] } }>(`{ me { camps { activeHeroes livingHeroes } } }`, {}, p);
    expect(counts.data?.me.camps).toEqual([{ activeHeroes: 0, livingHeroes: 0 }]);
    const next = await gql(recruit, { id: randomUUID() }, p);
    expect(next.errors).toBeUndefined();

    const missing = await gql(retire, { id: randomUUID() }, `p-${randomUUID()}`);
    expect((missing.errors?.[0] as { extensions?: { code?: string } } | undefined)?.extensions?.code).toBe("NOT_FOUND");
  });
});

describe("the adventure loop through the graph", () => {
  it("starts once, refuses a second start, settles with the engine's rewards, and refuses a second settle", async () => {
    const p = `p-${randomUUID()}`;
    await repo.putPlayer({ id: p, name: "Eve" });

    const start = await gql<{ startAdventure: { id: string; seed: string } }>(`mutation { startAdventure { id seed } }`, {}, p);
    expect(start.errors).toBeUndefined();
    const { id: adventureId, seed } = start.data!.startAdventure;

    const again = await gql(`mutation { startAdventure { id } }`, {}, p);
    expect(again.errors?.[0]?.message).toMatch(/condition failed/);

    const settle = await gql<{ settleAdventure: { camps: { holdings: { material: string; balance: number }[] }[] } }>(
      `mutation($id: String!) { settleAdventure(adventureId: $id) { camps { holdings { material balance } } } }`,
      { id: adventureId },
      p,
    );
    expect(settle.errors).toBeUndefined();
    // A fresh player holds exactly what the engine pays for the seed the
    // mutation returned: the same answer the client would compute.
    const holdings = settle.data!.settleAdventure.camps[0]!.holdings;
    const byMaterial = (a: { material: string }, b: { material: string }) => a.material.localeCompare(b.material);
    expect([...holdings].sort(byMaterial)).toEqual(
      rewardsForSeed(seed).map((r) => ({ material: r.material, balance: r.amount })).sort(byMaterial),
    );

    const redelivered = await gql(
      `mutation($id: String!) { settleAdventure(adventureId: $id) { id } }`,
      { id: adventureId },
      p,
    );
    expect(redelivered.errors?.[0]?.message).toMatch(/condition failed/);
    expect(await repo.holdings(p, "millbrook")).toEqual(expect.arrayContaining(holdings));
  });
});
