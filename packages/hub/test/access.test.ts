import SchemaBuilder from "@pothos/core";
import ScopeAuthPlugin from "@pothos/plugin-scope-auth";
import { getNamedType, type GraphQLField, type GraphQLNamedType, type GraphQLSchema, isAbstractType, isInterfaceType, isObjectType } from "graphql";
import { describe, expect, it } from "vitest";

import { schema } from "../src/schema/schema.js";

/**
 * Who may read what (docs/standards/graphql.md, rule 11). The scope-auth plugin
 * leaves a field with no scope open and cannot deny by default (decision 0043),
 * so this test does: the walk works out each field's access from the built
 * schema and compares it with the table, and a new field the walk reaches fails
 * until someone says here who may read it.
 *
 * The walk stops at `self` and at a mutation with a scope, so a new field that
 * only those reach, on `Hero` or `Camp`, is not in the table. A mutation with a
 * scope answers the caller's own work; one without appears as "anyone" and fails.
 * A scope with no group here fails the walk, so a new one is given a group first.
 * The test sees scopes and nothing else: what a resolver decides at run time, as
 * `adventure(id)` does for an adventure that is not settled, and what a field
 * holds, are read in review.
 *
 * A change to this table changes rule 11 in the same pull request.
 */
const ACCESS = {
  anyone: {
    Query: ["player", "version"],
    Player: ["id"],
  },
  "any signed-in player": {
    Query: ["adventure", "heroesSeenAt", "me"],
    Adventure: ["id", "job", "location", "result", "seed", "snapshot", "startedAt", "status", "timeline", "version"],
    AdventureResult: ["credited", "endedAtMs", "heroes", "lost", "outcome", "reachedStage", "rewards", "stages"],
    HeroOutcome: ["dead", "health", "heroId", "level", "xp", "xpGained"],
    Job: ["description", "facility", "id", "location", "name"],
    Reward: ["amount", "material"],
    SeenHero: ["id", "level", "name", "spriteSet", "unitType"],
    Snapshot: ["heroes", "jobId", "version"],
    SnapshotHero: ["heroId", "level", "name", "spriteSet", "stats", "unitType"],
    StageResult: ["ended", "endedAtMs", "kind", "stage", "startedAtMs"],
    UnitStats: ["damage", "gathering", "maxHealth", "speed"],
  },
  "only the owner": {
    Player: ["camps", "heroes", "name", "openAdventure"],
  },
} satisfies Record<string, Record<string, readonly string[]>>;

type Access = keyof typeof ACCESS;

/** The table as the walk answers it: `Type.field` to who may read it. A field listed twice says two things, and fails. */
function listed(table: Record<string, Record<string, readonly string[]>> = ACCESS): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [who, types] of Object.entries(table)) {
    for (const [type, names] of Object.entries(types)) {
      for (const name of names) {
        if (Object.hasOwn(fields, `${type}.${name}`)) throw new Error(`${type}.${name} is listed twice`);
        fields[`${type}.${name}`] = who;
      }
    }
  }
  return fields;
}

/**
 * The names a field's scope declares, from the options Pothos keeps on the built
 * field, where the plugin reads them too. A scope written as a function is called
 * with an empty parent, which is enough to name its scopes; what it returns other
 * than an object of names reads as itself, which no group matches. Were an upgrade
 * to move the options, no scope would be read and the table would fail.
 */
function scopeOf(field: GraphQLField<unknown, unknown>): string | undefined {
  const scope = (field.extensions["pothosOptions"] as { authScopes?: unknown } | undefined)?.authScopes;
  if (scope === undefined) return undefined;
  const declared: unknown = typeof scope === "function" ? (scope as (parent: object) => unknown)({}) : scope;
  return typeof declared === "object" && declared !== null ? Object.keys(declared).join(" and ") : String(declared);
}

/**
 * Walks from the root types. `authenticated` alone walks on, because every
 * player passes it, so it keeps nothing from another player; `self` alone stops
 * the walk; any other scope fails it, because nothing here says who that lets
 * read. A field reached by two paths takes the wider.
 */
function accessOf(built: GraphQLSchema): Record<string, Access> {
  const access: Record<string, Access> = {};
  const reached = new Map<string, Access>();

  const visit = (type: GraphQLNamedType, path: Access): void => {
    // A path is only ever one of the first two, so "anyone" is the only wider one.
    if (reached.get(type.name) === "anyone" || reached.get(type.name) === path) return;
    reached.set(type.name, path);
    if (isAbstractType(type)) {
      for (const member of built.getPossibleTypes(type)) visit(member, path);
    }
    if (!isObjectType(type) && !isInterfaceType(type)) return;
    for (const field of Object.values(type.getFields())) {
      const scope = scopeOf(field);
      if (type === built.getMutationType() && scope !== undefined) continue;
      const name = `${type.name}.${field.name}`;
      if (scope === "self") {
        access[name] = "only the owner";
        continue;
      }
      if (scope !== undefined && scope !== "authenticated") throw new Error(`${name}: the table has no group for the scope ${scope}`);
      access[name] = scope === undefined ? path : "any signed-in player";
      visit(getNamedType(field.type), access[name]);
    }
  };

  for (const root of [built.getQueryType(), built.getMutationType(), built.getSubscriptionType()]) {
    if (root) visit(root, "anyone");
  }
  return access;
}

describe("who may read what", () => {
  it("is what the table says, for every field the walk reaches", () => {
    expect(accessOf(schema)).toEqual(listed());
  });
});

describe("the table", () => {
  it("fails on a field listed in two groups", () => {
    expect(() => listed({ anyone: { Player: ["name"] }, "only the owner": { Player: ["name"] } })).toThrow("Player.name is listed twice");
  });
});

describe("the walk", () => {
  const smallBuilder = () =>
    new SchemaBuilder<{
      Context: object;
      DefaultFieldNullability: false;
      AuthScopes: { authenticated: boolean; self: string; friend: string };
    }>({
      plugins: [ScopeAuthPlugin],
      defaultFieldNullability: false,
      scopeAuth: { authScopes: () => ({ authenticated: true, self: () => true, friend: () => true }) },
    });
  const small = smallBuilder();
  const id = { resolve: () => "id" };
  const signedIn = { authScopes: { authenticated: true } };

  const Open = small.objectRef<object>("Open").implement({
    fields: (t) => ({
      unlisted: t.id(id),
      secret: t.id({ ...id, authScopes: () => ({ self: "owner" }) }),
    }),
  });
  const BehindSecret = small.objectRef<object>("BehindSecret").implement({ fields: (t) => ({ id: t.id(id) }) });
  const OnlySignedIn = small.objectRef<object>("OnlySignedIn").implement({
    fields: (t) => ({
      unlisted: t.id(id),
      behindSecret: t.field({ type: BehindSecret, authScopes: () => ({ self: "owner" }), resolve: () => ({}) }),
    }),
  });
  const Both = small.objectRef<object>("Both").implement({ fields: (t) => ({ id: t.id(id) }) });
  const Beneath = small.objectRef<object>("Beneath").implement({ fields: (t) => ({ id: t.id(id) }) });
  const NarrowFirst = small.objectRef<object>("NarrowFirst").implement({
    fields: (t) => ({ beneath: t.field({ type: Beneath, resolve: () => ({}) }) }),
  });
  const SignedInByFunction = small.objectRef<object>("SignedInByFunction").implement({ fields: (t) => ({ id: t.id(id) }) });
  const Member = small.objectRef<object>("Member").implement({ fields: (t) => ({ id: t.id(id) }) });
  const Either = small.unionType("Either", { types: [Member], resolveType: () => Member });
  const OwnWork = small.objectRef<object>("OwnWork").implement({ fields: (t) => ({ id: t.id(id) }) });
  const Unscoped = small.objectRef<object>("Unscoped").implement({ fields: (t) => ({ id: t.id(id) }) });

  small.queryType({
    fields: (t) => ({
      open: t.field({ type: Open, resolve: () => ({}) }),
      signedIn: t.field({ type: OnlySignedIn, ...signedIn, resolve: () => ({}) }),
      both: t.field({ type: Both, resolve: () => ({}) }),
      bothSignedIn: t.field({ type: Both, ...signedIn, resolve: () => ({}) }),
      // Pothos sorts the built schema's fields, so these names make the walk take the narrow path first.
      firstSignedIn: t.field({ type: NarrowFirst, ...signedIn, resolve: () => ({}) }),
      thenOpen: t.field({ type: NarrowFirst, resolve: () => ({}) }),
      signedInByFunction: t.field({ type: SignedInByFunction, authScopes: () => ({ authenticated: true }), resolve: () => ({}) }),
      either: t.field({ type: Either, resolve: () => ({}) }),
    }),
  });
  small.mutationType({
    fields: (t) => ({
      scoped: t.field({ type: OwnWork, ...signedIn, resolve: () => ({}) }),
      unscoped: t.field({ type: Unscoped, resolve: () => ({}) }),
    }),
  });
  const walked = accessOf(small.toSchema());

  it("reaches a field with no scope, so that one not listed fails the table", () => {
    expect(walked["Open.unlisted"]).toBe("anyone");
  });

  it("stops at self", () => {
    expect(walked["Open.secret"]).toBe("only the owner");
    expect(walked["OnlySignedIn.behindSecret"]).toBe("only the owner");
    expect(Object.keys(walked)).not.toContain("BehindSecret.id");
  });

  it("walks on past authenticated, which every player passes, however it is written", () => {
    expect(walked["Query.signedIn"]).toBe("any signed-in player");
    expect(walked["OnlySignedIn.unlisted"]).toBe("any signed-in player");
    expect(walked["SignedInByFunction.id"]).toBe("any signed-in player");
  });

  it("fails on a scope the table has no group for", () => {
    const scopes = [
      { name: "another scope", authScopes: () => ({ friend: "owner" }) },
      { name: "two scopes, either of which lets a caller read", authScopes: { authenticated: true, self: "owner" } },
      { name: "a function that declares two", authScopes: () => ({ authenticated: true, self: "owner" }) },
      { name: "a function that answers without naming a scope", authScopes: () => true },
    ];
    for (const { name, authScopes } of scopes) {
      const builder = smallBuilder();
      builder.queryType({ fields: (t) => ({ field: t.id({ ...id, authScopes }) }) });
      expect(() => accessOf(builder.toSchema()), name).toThrow("Query.field: the table has no group");
    }
  });

  it("gives a field reached by two paths the wider access, in either order", () => {
    expect(walked["Both.id"]).toBe("anyone");
    expect(walked["NarrowFirst.beneath"]).toBe("anyone");
    expect(walked["Beneath.id"]).toBe("anyone");
  });

  it("walks a union's members", () => {
    expect(walked["Member.id"]).toBe("anyone");
  });

  it("stops at a mutation with a scope, and reaches one without", () => {
    expect(Object.keys(walked)).not.toContain("Mutation.scoped");
    expect(Object.keys(walked)).not.toContain("OwnWork.id");
    expect(walked["Mutation.unscoped"]).toBe("anyone");
    expect(walked["Unscoped.id"]).toBe("anyone");
  });
});
