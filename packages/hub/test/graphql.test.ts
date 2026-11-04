import { randomUUID } from "node:crypto";

import type { APIGatewayProxyEventV2WithJWTAuthorizer, Context as LambdaContext } from "aws-lambda";
import { beforeAll, describe, expect, it } from "vitest";

import { MAX_PARTY, must } from "@heat/engine";

import { configFromEnv, createDocumentClient } from "../src/db/client.js";
import { Repository } from "../src/db/repository.js";
import { MAX_ABILITY_ID, MAX_OVERRIDES } from "../src/submit.js";

/**
 * Drives the Lambda handler with synthesized HTTP API (payload 2.0) events,
 * the shape API Gateway sends after its JWT authorizer has validated the
 * token and attached the claims. Rule 2 of decision 0009: the handler is a
 * plain function of an event, so the test calls it like Lambda would.
 *
 * Every mutation takes one input object and answers a result union
 * (docs/standards/graphql.md, rules 5 and 6): the test reads `__typename`
 * as the client does, a refusal being a member of the union and malformed
 * input a GraphQLError in `errors`.
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

/** A mutation's result union as the test selects it: the type name, and the success's field when it succeeded. */
type Result<K extends string, T> = { __typename: string } & Partial<Record<K, T>> & Record<string, unknown>;

function gql<T>(query: Query<T>, variables?: Record<string, unknown>, playerId?: string, headers?: Record<string, string>): Promise<Reply<T>>;
/** A plain string asks for nothing in particular, and its data is `unknown`. */
function gql(query: string, variables?: Record<string, unknown>, playerId?: string, headers?: Record<string, string>): Promise<Reply<unknown>>;
async function gql(query: string, variables: Record<string, unknown> = {}, playerId?: string, headers: Record<string, string> = {}): Promise<Reply<unknown>> {
  const res = await handler(event(query, variables, playerId, headers), {} as LambdaContext);
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body ?? "{}") as Reply<unknown>;
}

/** A request Apollo refuses before executing it, which it answers with a 400 and the reason in `errors`. */
async function invalid(query: string, variables: Record<string, unknown>, playerId: string): Promise<Reply<unknown>> {
  const res = await handler(event(query, variables, playerId), {} as LambdaContext);
  expect(res.statusCode).toBe(400);
  return JSON.parse(res.body ?? "{}") as Reply<unknown>;
}

const JOIN = `mutation { joinGame { ... on JoinGameSuccess { player { id name } } } }` as Query<{ joinGame: Result<"player", { id: string; name: string }> }>;
const START = `mutation($heroIds: [ID!]!) {
  startAdventure(input: { location: "millbrook", jobId: "wolves-on-the-mill-road", heroIds: $heroIds }) {
    __typename
    ... on StartAdventureSuccess { adventure { id seed } }
    ... on AdventureOpen { adventureId }
  }
}` as Query<{ startAdventure: Result<"adventure", { id: string; seed: string }> }>;
const RECRUIT = `mutation($id: UUID!) {
  recruitHero(input: { unitType: VILLAGER, requestId: $id }) {
    __typename
    ... on RecruitHeroSuccess { hero { id name unitType spriteSet status } }
    ... on Error { message }
  }
}` as Query<{ recruitHero: Result<"hero", { id: string; name: string; unitType: string; spriteSet: string; status: string }> }>;
const RETIRE = `mutation($id: ID!) {
  retireHero(input: { heroId: $id }) {
    __typename
    ... on RetireHeroSuccess { hero { id status retiredAt } }
  }
}` as Query<{ retireHero: Result<"hero", { id: string; status: string; retiredAt: string | null }> }>;

describe("authorization at the field level", () => {
  it("serves public fields to anyone and private fields only to the owner", async () => {
    const owner = `p-${randomUUID()}`;
    const other = `p-${randomUUID()}`;
    await repo.putPlayer({ id: owner, name: "Owner" });
    await repo.setBalance(owner, "millbrook", "timber", 5);

    const q = `query($id: ID!) { player(id: $id) { id name camps { location holdings { material balance } } heroes { id } } }`;

    const asOther = await gql(q as Query<{ player: { name: string; camps: unknown; heroes: unknown } }>, { id: owner }, other);
    expect(asOther.data?.player.name).toBe("Owner");
    expect(asOther.data?.player.camps).toBeNull();
    expect(asOther.data?.player.heroes).toBeNull();
    expect(asOther.errors?.map((e) => e.path)).toEqual(expect.arrayContaining([["player", "camps"], ["player", "heroes"]]));
    expect(asOther.errors?.map((e) => e.extensions?.["code"])).toEqual(["FORBIDDEN", "FORBIDDEN"]);

    const asOwner = await gql(q as Query<{ player: { camps: { location: string; holdings: { material: string; balance: number }[] }[] } }>, { id: owner }, owner);
    expect(asOwner.errors).toBeUndefined();
    // The engine's `timber` is the enum value TIMBER on the wire (graphql.md, rule 4).
    expect(asOwner.data?.player.camps).toEqual([{ location: "millbrook", holdings: [{ material: "TIMBER", balance: 5 }] }]);

    const anonymous = await gql(`{ me { id } }` as Query<{ me: unknown }>);
    expect(anonymous.data?.me).toBeNull();
    expect(anonymous.errors?.[0]?.path).toEqual(["me"]);
    expect(anonymous.errors?.[0]?.extensions?.["code"]).toBe("UNAUTHENTICATED");

    // The same code for an anonymous caller failing `self`: it is the caller that decides, not the scope.
    const anonymousOwner = await gql(q as Query<{ player: { name: string; camps: unknown; heroes: unknown } }>, { id: owner });
    expect(anonymousOwner.data?.player.name).toBe("Owner");
    expect(anonymousOwner.data?.player.camps).toBeNull();
    expect(anonymousOwner.errors?.map((e) => e.extensions?.["code"])).toEqual(["UNAUTHENTICATED", "UNAUTHENTICATED"]);
  });
});

describe("first sign-in", () => {
  it("makes the profile once, with joinGame, and starting an adventure no longer does", async () => {
    const p = `p-${randomUUID()}`;
    await gql(START, { heroIds: [randomUUID()] }, p);
    expect(await repo.getPlayer(p)).toBeUndefined();

    const joined = await gql(JOIN, {}, p);
    expect(joined.errors).toBeUndefined();
    // No email claim in the synthesized token, so the name falls back to the subject.
    expect(joined.data?.joinGame.player).toEqual({ id: p, name: p });

    await repo.putPlayer({ id: p, name: "Renamed in the table" });
    const again = await gql(JOIN, {}, p);
    expect(again.data?.joinGame.player?.name).toBe("Renamed in the table");
  });
});

describe("the camp through the graph", () => {
  it("shows a new player the starting camp, recruits the free villager, and refuses a second", async () => {
    const p = `p-${randomUUID()}`;
    await gql(JOIN, {}, p);
    const camp = `{ me { camps { location name hallLevel heroCapacity resourceCapacity activeHeroes livingHeroes } heroes { id name unitType spriteSet status } } }`;

    const before = await gql(camp as Query<{ me: { camps: unknown[]; heroes: unknown[] } }>, {}, p);
    expect(before.data?.me).toEqual({
      camps: [{ location: "millbrook", name: "Millbrook", hallLevel: 1, heroCapacity: 4, resourceCapacity: 100, activeHeroes: 0, livingHeroes: 0 }],
      heroes: [],
    });

    const requestId = randomUUID();
    const made = await gql(RECRUIT, { id: requestId }, p);
    expect(made.errors).toBeUndefined();
    expect(made.data?.recruitHero.__typename).toBe("RecruitHeroSuccess");
    expect(made.data?.recruitHero.hero).toMatchObject({ id: requestId, unitType: "VILLAGER", status: "ALIVE" });

    const after = await gql(camp as Query<{ me: { camps: { activeHeroes: number }[]; heroes: unknown[] } }>, {}, p);
    expect(after.data?.me.camps[0]?.activeHeroes).toBe(1);
    expect(after.data?.me.heroes).toEqual([made.data?.recruitHero.hero]);

    // The refusal is data: a member of the result union, with its message, and no entry in errors.
    const second = await gql(RECRUIT, { id: randomUUID() }, p);
    expect(second.errors).toBeUndefined();
    expect(second.data?.recruitHero).toEqual({ __typename: "InsufficientResources", message: "a villager costs 20 timber, and the camp has 0" });
  });

  it("retires the villager, which frees the next villager", async () => {
    const p = `p-${randomUUID()}`;
    await gql(JOIN, {}, p);
    const id = randomUUID();
    await gql(RECRUIT, { id }, p);

    const retired = await gql(RETIRE, { id }, p);
    expect(retired.errors).toBeUndefined();
    expect(retired.data?.retireHero.hero).toMatchObject({ id, status: "RETIRED" });
    expect(retired.data?.retireHero.hero?.retiredAt).toEqual(expect.any(String));

    const counts = await gql(`{ me { camps { activeHeroes livingHeroes } } }` as Query<{ me: { camps: unknown[] } }>, {}, p);
    expect(counts.data?.me.camps).toEqual([{ activeHeroes: 0, livingHeroes: 0 }]);
    const next = await gql(RECRUIT, { id: randomUUID() }, p);
    expect(next.data?.recruitHero.__typename).toBe("RecruitHeroSuccess");

    // Another player's hero is not said to exist: the client's defect, in errors, not a refusal type.
    const missing = await gql(RETIRE, { id: randomUUID() }, `p-${randomUUID()}`);
    expect(missing.data?.retireHero).toBeNull();
    expect(missing.errors?.[0]?.extensions?.["code"]).toBe("BAD_USER_INPUT");
  });

  it("shows other players' heroes seen at the location by their public fields, never the caller's own", async () => {
    const p = `p-${randomUUID()}`;
    await gql(JOIN, {}, p);
    const mine = randomUUID();
    await gql(RECRUIT, { id: mine }, p);

    const seen = `query($at: ID!) { heroesSeenAt(location: $at) { id name unitType spriteSet level } }`;
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
    await gql(JOIN, {}, p);
    const villager = randomUUID();
    await gql(RECRUIT, { id: villager }, p);

    const start = await gql(START, { heroIds: [villager] }, p);
    expect(start.errors).toBeUndefined();
    const { id: adventureId, seed } = must(start.data?.startAdventure.adventure, "the start's adventure");

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
        heroes: [{ heroId: villager, unitType: "VILLAGER", level: 1, stats: { maxHealth: 30, speed: 8, damage: 4, gathering: 4 } }],
      },
    });

    const again = await gql(START, { heroIds: [villager] }, p);
    expect(again.errors).toBeUndefined();
    expect(again.data?.startAdventure).toEqual({ __typename: "AdventureOpen", adventureId });

    const retire = await gql(RETIRE, { id: villager }, p);
    expect(retire.data?.retireHero.__typename).toBe("HeroAdventuring");

    // Submit's refusals that come before the replay bucket: settling itself
    // is proven against the in-memory store (settle.test.ts) and on the
    // stack against the real bucket.
    const SUBMIT = `mutation($id: ID!, $log: [OverrideInput!]!) {
      submitAdventure(input: { adventureId: $id, overrides: $log }) { __typename ... on SubmitAdventureSuccess { adventure { id status } } }
    }` as Query<{ submitAdventure: Result<"adventure", { id: string; status: string }> | null }>;
    const stranger = await gql(SUBMIT, { id: adventureId, log: [] }, `p-${randomUUID()}`);
    expect(stranger.data?.submitAdventure).toBeNull();
    expect(stranger.errors?.[0]?.extensions?.["code"]).toBe("BAD_USER_INPUT");
    const badLog = await gql(SUBMIT, { id: adventureId, log: [{ kind: "UNIT", acceptedAtSimTime: 0, unitId: "nobody", abilityId: "swing" }] }, p);
    expect(badLog.errors?.[0]?.extensions?.["code"]).toBe("BAD_USER_INPUT");
    const discard = await gql(
      `mutation($id: ID!) { discardAdventure(input: { adventureId: $id }) { __typename ... on AdventureVerifiable { version } } }` as Query<{ discardAdventure: Result<never, never> }>,
      { id: adventureId }, p,
    );
    expect(discard.errors).toBeUndefined();
    expect(discard.data?.discardAdventure).toEqual({ __typename: "AdventureVerifiable", version });

    // The record, open: its player reads it with no result and no timeline; nobody else does.
    const read = `query($id: ID!) { adventure(id: $id) { id status result { outcome } timeline } }`;
    const own = await gql(read as Query<{ adventure: unknown }>, { id: adventureId }, p);
    expect(own.data?.adventure).toEqual({ id: adventureId, status: "OPEN", result: null, timeline: null });
    const other = await gql(read as Query<{ adventure: unknown }>, { id: adventureId }, `p-${randomUUID()}`);
    expect(other.data?.adventure).toBeNull();
  });

  it("refuses an input the schema cannot read before any resolver runs", async () => {
    const p = `p-${randomUUID()}`;
    await gql(JOIN, {}, p);
    // A unit type outside the enum, and a mutation called with its old positional arguments.
    const dragon = await invalid(`mutation($id: UUID!) { recruitHero(input: { unitType: DRAGON, requestId: $id }) { __typename } }`, { id: randomUUID() }, p);
    expect(dragon.data).toBeUndefined();
    expect(dragon.errors?.[0]?.extensions?.["code"]).toBe("GRAPHQL_VALIDATION_FAILED");
    const positional = await invalid(`mutation { recruitHero(unitType: VILLAGER, requestId: "x") { __typename } }`, {}, p);
    expect(positional.errors?.[0]?.extensions?.["code"]).toBe("GRAPHQL_VALIDATION_FAILED");
  });

  describe("every boundary of the contract", () => {
    const code = (reply: Reply<unknown>) => reply.errors?.[0]?.extensions?.["code"];
    const message = (reply: Reply<unknown>) => reply.errors?.[0]?.message;
    const ANY_LOG = `mutation($log: [OverrideInput!]!) { submitAdventure(input: { adventureId: "any", overrides: $log }) { __typename } }`;
    const BUILD = `mutation($level: PositiveInt!) { buildFacility(input: { location: "millbrook", kind: MINE, level: $level }) { __typename } }`;
    const unitEntry = { kind: "UNIT", acceptedAtSimTime: 0, unitId: "any", abilityId: "swing" };

    it.each(["not-a-uuid", 7])("refuses the request id %s by its scalar", async (id) => {
      const reply = await invalid(RECRUIT, { id }, `p-${randomUUID()}`);
      expect(code(reply)).toBe("BAD_USER_INPUT");
      expect(message(reply)).toContain("$id");
    });

    it("refuses what the scalar lets through as a UUID", async () => {
      const reply = await gql(RECRUIT, { id: `${randomUUID()}}` }, `p-${randomUUID()}`);
      expect(code(reply)).toBe("BAD_USER_INPUT");
      expect(message(reply)).toContain("a request id is a UUID");
    });

    it("takes a request id in any case as one request", async () => {
      const p = `p-${randomUUID()}`;
      await gql(JOIN, {}, p);
      const id = randomUUID();
      const first = await gql(RECRUIT, { id: id.toUpperCase() }, p);
      const repeat = await gql(RECRUIT, { id }, p);
      expect(first.data?.recruitHero).toMatchObject({ __typename: "RecruitHeroSuccess", hero: { id } });
      expect(repeat.data?.recruitHero).toMatchObject({ __typename: "RecruitHeroSuccess", hero: { id } });
    });

    it("refuses a party of none, of too many, or with a hero twice", async () => {
      const p = `p-${randomUUID()}`;
      const id = randomUUID();
      for (const [heroIds, words] of [
        [[], `a party is 1 to ${MAX_PARTY} heroes`],
        [Array.from({ length: MAX_PARTY + 1 }, () => randomUUID()), `a party is 1 to ${MAX_PARTY} heroes`],
        [[id, id.toUpperCase()], "a hero is in the party twice"],
      ] as const) {
        const reply = await gql(START, { heroIds }, p);
        expect(code(reply)).toBe("BAD_USER_INPUT");
        expect(message(reply)).toContain(words);
      }
      expect(await repo.openAdventure(p)).toBeUndefined();
    });

    it("refuses a malformed party before a refusal: an open adventure is not read first", async () => {
      const p = `p-${randomUUID()}`;
      await gql(JOIN, {}, p);
      const villager = randomUUID();
      await gql(RECRUIT, { id: villager }, p);
      await gql(START, { heroIds: [villager] }, p);
      const open = must(await repo.openAdventure(p), "the open adventure");

      const reply = await gql(START, { heroIds: Array.from({ length: MAX_PARTY + 1 }, () => randomUUID()) }, p);
      expect(code(reply)).toBe("BAD_USER_INPUT");
      expect((await repo.openAdventure(p))?.adventureId).toBe(open.adventureId);
    });

    it("refuses a log of too many entries and an ability id of too many characters", async () => {
      const p = `p-${randomUUID()}`;
      const long = await gql(ANY_LOG, { log: Array.from({ length: MAX_OVERRIDES + 1 }, () => unitEntry) }, p);
      expect(code(long)).toBe("BAD_USER_INPUT");
      expect(message(long)).toContain(`a log holds at most ${MAX_OVERRIDES} entries`);
      const named = await gql(ANY_LOG, { log: [{ ...unitEntry, abilityId: "a".repeat(MAX_ABILITY_ID + 1) }] }, p);
      expect(code(named)).toBe("BAD_USER_INPUT");
      expect(message(named)).toContain(`an ability id is at most ${MAX_ABILITY_ID} characters`);
    });

    it.each([-1, 1.5, "7abc", 1e21])("refuses the time %s", async (acceptedAtSimTime) => {
      const reply = await invalid(ANY_LOG, { log: [{ ...unitEntry, acceptedAtSimTime }] }, `p-${randomUUID()}`);
      expect(code(reply)).toBe("BAD_USER_INPUT");
      expect(message(reply)).toContain("acceptedAtSimTime");
    });

    it.each([0, -1, 1.5, "2abc", 1e21])("refuses the level %s", async (level) => {
      const reply = await invalid(BUILD, { level }, `p-${randomUUID()}`);
      expect(code(reply)).toBe("BAD_USER_INPUT");
      expect(message(reply)).toContain("$level");
    });

    it("checks input before a scope, and a well-formed request still needs the scope", async () => {
      expect(code(await gql(START, { heroIds: [] }))).toBe("BAD_USER_INPUT");
      expect(code(await gql(START, { heroIds: [randomUUID()] }))).toBe("UNAUTHENTICATED");
    });
  });
});

describe("the deploy's version", () => {
  it("flags outdated on a response to a client of another version, errors included, and never otherwise", async () => {
    const p = `p-${randomUUID()}`;
    await gql(JOIN, {}, p);
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
    // A party of none is malformed input, in errors; the flag rides on that response too.
    const refused = await gql(START, { heroIds: [] }, p, { "heat-version": "0".repeat(40) });
    expect(refused.errors?.[0]?.extensions?.["code"]).toBe("BAD_USER_INPUT");
    expect(refused.extensions?.["outdated"]).toBe(true);
  });
});
