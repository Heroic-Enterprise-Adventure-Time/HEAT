import { randomUUID } from "node:crypto";
import type { APIGatewayProxyEventV2WithJWTAuthorizer, Context as LambdaContext } from "aws-lambda";
import { beforeAll, describe, expect, it } from "vitest";
import { configFromEnv, createDocumentClient } from "../src/db/client.js";
import { Repository } from "../src/db/repository.js";
import { must } from "./must.js";

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

function event(
  query: string,
  variables: Record<string, unknown> = {},
  playerId?: string,
  headers: Record<string, string> = {},
): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    version: "2.0",
    routeKey: "POST /graphql",
    rawPath: "/graphql",
    rawQueryString: "",
    headers: { "content-type": "application/json", ...headers },
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

/** The handler's reply: the data the query selected, the errors, and the extensions. */
interface Reply<T> {
  data?: T;
  errors?: { message: string; path?: (string | number)[]; extensions?: Record<string, unknown> }[];
  extensions?: Record<string, unknown>;
}

/**
 * A query with the shape of the data it selects, `QUERY as Query<{ me: { id: string } }>`,
 * so that the reply is typed by the query that asked for it and not by the call.
 * The brand exists only in the type: the query is a string at run time.
 */
type Query<T> = string & { readonly selects: T };

function gql<T>(query: Query<T>, variables?: Record<string, unknown>, playerId?: string, headers?: Record<string, string>): Promise<Reply<T>>;
/** A plain string asks for nothing in particular, and its data is `unknown`. */
function gql(query: string, variables?: Record<string, unknown>, playerId?: string, headers?: Record<string, string>): Promise<Reply<unknown>>;
async function gql(query: string, variables: Record<string, unknown> = {}, playerId?: string, headers: Record<string, string> = {}): Promise<Reply<unknown>> {
  const res = await handler(event(query, variables, playerId, headers), {} as LambdaContext);
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body ?? "{}") as Reply<unknown>;
}

const START = `mutation($heroIds: [String!]!) { startAdventure(location: "millbrook", jobId: "wolves-on-the-mill-road", heroIds: $heroIds) { id seed } }`;

describe("authorization at the field level", () => {
  it("serves public fields to anyone and private fields only to the owner", async () => {
    const owner = `p-${randomUUID()}`;
    const other = `p-${randomUUID()}`;
    await repo.putPlayer({ id: owner, name: "Owner" });
    await repo.setBalance(owner, "millbrook", "timber", 5);

    const q = `query($id: String!) { player(id: $id) { id name camps { location holdings { material balance } } heroes { id } } }`;

    const asOther = await gql(q as Query<{ player: { name: string; camps: unknown; heroes: unknown } }>, { id: owner }, other);
    expect(asOther.data?.player.name).toBe("Owner");
    expect(asOther.data?.player.camps).toBeNull();
    expect(asOther.data?.player.heroes).toBeNull();
    expect(asOther.errors?.map((e) => e.path)).toEqual(expect.arrayContaining([["player", "camps"], ["player", "heroes"]]));

    const asOwner = await gql(q as Query<{ player: { camps: { location: string; holdings: { material: string; balance: number }[] }[] } }>, { id: owner }, owner);
    expect(asOwner.errors).toBeUndefined();
    expect(asOwner.data?.player.camps).toEqual([{ location: "millbrook", holdings: [{ material: "timber", balance: 5 }] }]);

    const anonymous = await gql(`{ me { id } }` as Query<{ me: unknown }>);
    expect(anonymous.data?.me).toBeNull();
    expect(anonymous.errors?.[0]?.path).toEqual(["me"]);
  });
});

describe("first sign-in", () => {
  it("makes the profile once, with joinGame, and starting an adventure no longer does", async () => {
    const p = `p-${randomUUID()}`;
    await gql(START, { heroIds: [randomUUID()] }, p);
    expect(await repo.getPlayer(p)).toBeUndefined();

    const joined = await gql(`mutation { joinGame { id name } }` as Query<{ joinGame: { id: string; name: string } }>, {}, p);
    expect(joined.errors).toBeUndefined();
    // No email claim in the synthesized token, so the name falls back to the subject.
    expect(joined.data?.joinGame).toEqual({ id: p, name: p });

    await repo.putPlayer({ id: p, name: "Renamed in the table" });
    const again = await gql(`mutation { joinGame { name } }` as Query<{ joinGame: { name: string } }>, {}, p);
    expect(again.data?.joinGame.name).toBe("Renamed in the table");
  });
});

describe("the camp through the graph", () => {
  it("shows a new player the starting camp, recruits the free villager, and refuses a second", async () => {
    const p = `p-${randomUUID()}`;
    await gql(`mutation { joinGame { id } }`, {}, p);
    const camp = `{ me { camps { location name hallLevel heroCapacity resourceCapacity activeHeroes livingHeroes } heroes { id name unitType spriteSet status } } }`;

    const before = await gql(camp as Query<{ me: { camps: unknown[]; heroes: unknown[] } }>, {}, p);
    expect(before.data?.me).toEqual({
      camps: [{ location: "millbrook", name: "Millbrook", hallLevel: 1, heroCapacity: 4, resourceCapacity: 100, activeHeroes: 0, livingHeroes: 0 }],
      heroes: [],
    });

    const requestId = randomUUID();
    const recruit = `mutation($id: String!) { recruitHero(unitType: "villager", requestId: $id) { id name unitType spriteSet status } }`;
    const made = await gql(recruit as Query<{ recruitHero: { id: string; unitType: string; status: string } }>, { id: requestId }, p);
    expect(made.errors).toBeUndefined();
    expect(made.data?.recruitHero).toMatchObject({ id: requestId, unitType: "villager", status: "ALIVE" });

    const after = await gql(camp as Query<{ me: { camps: { activeHeroes: number }[]; heroes: unknown[] } }>, {}, p);
    expect(after.data?.me.camps[0]?.activeHeroes).toBe(1);
    expect(after.data?.me.heroes).toEqual([made.data?.recruitHero]);

    const second = await gql(recruit, { id: randomUUID() }, p);
    expect((second.errors?.[0] as { extensions?: { code?: string } } | undefined)?.extensions?.code).toBe("INSUFFICIENT_RESOURCES");
  });

  it("retires the villager, which frees the next villager", async () => {
    const p = `p-${randomUUID()}`;
    await gql(`mutation { joinGame { id } }`, {}, p);
    const recruit = `mutation($id: String!) { recruitHero(unitType: "villager", requestId: $id) { id } }`;
    const retire = `mutation($id: String!) { retireHero(heroId: $id) { id status retiredAt } }`;
    const id = randomUUID();
    await gql(recruit, { id }, p);

    const retired = await gql(retire as Query<{ retireHero: { id: string; status: string; retiredAt: string | null } }>, { id }, p);
    expect(retired.errors).toBeUndefined();
    expect(retired.data?.retireHero).toMatchObject({ id, status: "RETIRED" });
    expect(retired.data?.retireHero.retiredAt).toEqual(expect.any(String));

    const counts = await gql(`{ me { camps { activeHeroes livingHeroes } } }` as Query<{ me: { camps: unknown[] } }>, {}, p);
    expect(counts.data?.me.camps).toEqual([{ activeHeroes: 0, livingHeroes: 0 }]);
    const next = await gql(recruit, { id: randomUUID() }, p);
    expect(next.errors).toBeUndefined();

    const missing = await gql(retire, { id: randomUUID() }, `p-${randomUUID()}`);
    expect((missing.errors?.[0] as { extensions?: { code?: string } } | undefined)?.extensions?.code).toBe("NOT_FOUND");
  });

  it("shows other players' heroes seen at the location by their public fields, never the caller's own", async () => {
    const p = `p-${randomUUID()}`;
    await gql(`mutation { joinGame { id } }`, {}, p);
    const mine = randomUUID();
    await gql(`mutation($id: String!) { recruitHero(unitType: "villager", requestId: $id) { id } }`, { id: mine }, p);

    const seen = `query($at: String!) { heroesSeenAt(location: $at) { id name unitType spriteSet level } }`;
    const r = await gql(seen as Query<{ heroesSeenAt: { id: string }[] }>, { at: "millbrook" }, p);
    expect(r.errors).toBeUndefined();
    expect(r.data?.heroesSeenAt.length).toBeLessThanOrEqual(6);
    expect(r.data?.heroesSeenAt.map((h) => h.id)).not.toContain(mine);

    const fields = await gql(`{ __type(name: "SeenHero") { fields { name } } }` as Query<{ __type: { fields: { name: string }[] } }>);
    expect(fields.data?.__type.fields.map((f) => f.name).sort()).toEqual(["id", "level", "name", "spriteSet", "unitType"]);

    const anonymous = await gql(seen, { at: "millbrook" });
    expect(anonymous.errors).toBeDefined();
    const nowhere = await gql(seen, { at: "atlantis" }, p);
    expect((nowhere.errors?.[0] as { extensions?: { code?: string } } | undefined)?.extensions?.code).toBe("BAD_USER_INPUT");
  });
});

describe("the adventure loop through the graph", () => {
  it("starts a job with the villager, shows it on me, refuses a second start, and settles with the engine's rewards once", async () => {
    const p = `p-${randomUUID()}`;
    await gql(`mutation { joinGame { id } }`, {}, p);
    const villager = randomUUID();
    await gql(`mutation($id: String!) { recruitHero(unitType: "villager", requestId: $id) { id } }`, { id: villager }, p);

    const start = await gql(START as Query<{ startAdventure: { id: string; seed: string } }>, { heroIds: [villager] }, p);
    expect(start.errors).toBeUndefined();
    const { id: adventureId, seed } = must(start.data, "the start's data").startAdventure;

    const me = await gql(
      `{ me { openAdventure { id seed location version job { id name location } snapshot { version jobId heroes { heroId unitType level stats { maxHealth speed damage gathering } } } } } }` as Query<{ me: { openAdventure: unknown } }>,
      {}, p,
    );
    expect(me.errors).toBeUndefined();
    const version = process.env["HEAT_VERSION"];
    expect(me.data?.me.openAdventure).toEqual({
      id: adventureId, seed, location: "millbrook", version,
      job: { id: "wolves-on-the-mill-road", name: "Wolves on the mill road", location: "millbrook" },
      snapshot: {
        version, jobId: "wolves-on-the-mill-road",
        heroes: [{ heroId: villager, unitType: "villager", level: 1, stats: { maxHealth: 30, speed: 8, damage: 4, gathering: 4 } }],
      },
    });

    const again = await gql(START, { heroIds: [villager] }, p);
    expect(again.errors?.[0]?.extensions).toMatchObject({ code: "ADVENTURE_OPEN", adventureId });

    const retire = await gql(`mutation($id: String!) { retireHero(heroId: $id) { id } }`, { id: villager }, p);
    expect(retire.errors?.[0]?.extensions?.["code"]).toBe("HERO_ADVENTURING");

    // Submit's refusals that come before the replay bucket: settling itself
    // is proven against the in-memory store (settle.test.ts) and on the
    // stack against the real bucket.
    const SUBMIT = `mutation($id: String!, $log: [OverrideInput!]!) { submitAdventure(adventureId: $id, overrides: $log) { id status } }`;
    const stranger = await gql(SUBMIT, { id: adventureId, log: [] }, `p-${randomUUID()}`);
    expect(stranger.errors?.[0]?.extensions?.["code"]).toBe("NO_SUCH_ADVENTURE");
    const badLog = await gql(SUBMIT, { id: adventureId, log: [{ kind: "UNIT", acceptedAtSimTime: 0, unitId: "nobody", abilityId: "swing" }] }, p);
    expect(badLog.errors?.[0]?.extensions?.["code"]).toBe("BAD_USER_INPUT");
    const discard = await gql(`mutation($id: String!) { discardAdventure(adventureId: $id) { id } }`, { id: adventureId }, p);
    expect(discard.errors?.[0]?.extensions).toMatchObject({ code: "ADVENTURE_VERIFIABLE", version });

    // The record, open: its player reads it with no result and no timeline; nobody else does.
    const read = `query($id: String!) { adventure(id: $id) { id status result { outcome } timeline } }`;
    const own = await gql(read as Query<{ adventure: unknown }>, { id: adventureId }, p);
    expect(own.data?.adventure).toEqual({ id: adventureId, status: "OPEN", result: null, timeline: null });
    const other = await gql(read as Query<{ adventure: unknown }>, { id: adventureId }, `p-${randomUUID()}`);
    expect(other.data?.adventure).toBeNull();
  });
});

describe("the deploy's version", () => {
  it("flags outdated on a response to a client of another version, errors included, and never otherwise", async () => {
    const p = `p-${randomUUID()}`;
    await gql(`mutation { joinGame { id } }`, {}, p);
    const version = must(process.env["HEAT_VERSION"], "HEAT_VERSION");

    const asked = await gql(`{ version }` as Query<{ version: string }>, {}, p);
    expect(asked.data?.version).toBe(version);

    const same = await gql(`{ me { id } }`, {}, p, { "heat-version": version });
    expect(same.extensions?.["outdated"]).toBeUndefined();
    const none = await gql(`{ me { id } }`, {}, p);
    expect(none.extensions?.["outdated"]).toBeUndefined();

    const other = await gql(`{ me { id } }` as Query<{ me: { id: string } }>, {}, p, { "heat-version": "0".repeat(40) });
    expect(other.data?.me.id).toBe(p);
    expect(other.extensions?.["outdated"]).toBe(true);
    const refused = await gql(START, { heroIds: [] }, p, { "heat-version": "0".repeat(40) });
    expect(refused.errors?.[0]?.extensions?.["code"]).toBe("PARTY_SIZE");
    expect(refused.extensions?.["outdated"]).toBe(true);
  });
});
