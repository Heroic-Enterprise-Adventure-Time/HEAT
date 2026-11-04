import SchemaBuilder from "@pothos/core";
import ScopeAuthPlugin from "@pothos/plugin-scope-auth";
import { isEqual } from "es-toolkit";
import { getNamedType, type GraphQLField, type GraphQLNamedType, type GraphQLSchema, isAbstractType, isInterfaceType, isObjectType } from "graphql";
import { describe, expect, it } from "vitest";

import { schema } from "../src/schema/schema.js";

/**
 * Who may read what (docs/standards/graphql.md, rule 11). The scope-auth plugin
 * leaves a field with no scope open and cannot deny by default (decision 0043),
 * so this test does: the walk works out each field's access from the built
 * schema and compares it with the table, and a new field fails until someone
 * says here who may read it.
 *
 * A mutation is not in the table: one with a scope answers the caller's own
 * work, so the walk stops there, and one without appears as "anyone" and fails.
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

/** The table as the walk answers it: `Type.field` to who may read it. */
function listed(): Record<string, Access> {
  return Object.fromEntries(
    Object.entries(ACCESS).flatMap(([who, types]) =>
      Object.entries(types).flatMap(([type, fields]) => fields.map((field) => [`${type}.${field}`, who as Access])),
    ),
  );
}

/**
 * The options Pothos keeps on the built field, where the plugin reads them too.
 * Were an upgrade to move them, no scope would be read and the table would fail.
 */
function scopeOf(field: GraphQLField<unknown, unknown>): unknown {
  return (field.extensions["pothosOptions"] as { authScopes?: unknown } | undefined)?.authScopes;
}

/**
 * Walks from the root types. `authenticated` alone walks on, because every
 * player passes it, so it keeps nothing from another player; any other scope
 * says who may read the field and stops the walk there. A field reached by two
 * paths takes the wider.
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
      if (scope !== undefined && !isEqual(scope, { authenticated: true })) {
        access[name] = "only the owner";
        continue;
      }
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

describe("the walk", () => {
  const small = new SchemaBuilder<{
    Context: object;
    DefaultFieldNullability: false;
    AuthScopes: { authenticated: boolean; self: string };
  }>({
    plugins: [ScopeAuthPlugin],
    defaultFieldNullability: false,
    scopeAuth: { authScopes: () => ({ authenticated: true, self: () => true }) },
  });
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

  it("stops at a scope that says who may read", () => {
    expect(walked["Open.secret"]).toBe("only the owner");
    expect(walked["OnlySignedIn.behindSecret"]).toBe("only the owner");
    expect(walked).not.toHaveProperty("BehindSecret.id");
  });

  it("walks on past authenticated, which every player passes", () => {
    expect(walked["Query.signedIn"]).toBe("any signed-in player");
    expect(walked["OnlySignedIn.unlisted"]).toBe("any signed-in player");
  });

  it("gives a field reached by two paths the wider access", () => {
    expect(walked["Both.id"]).toBe("anyone");
  });

  it("walks a union's members", () => {
    expect(walked["Member.id"]).toBe("anyone");
  });

  it("stops at a mutation with a scope, and reaches one without", () => {
    expect(walked).not.toHaveProperty("Mutation.scoped");
    expect(walked).not.toHaveProperty("OwnWork.id");
    expect(walked["Mutation.unscoped"]).toBe("anyone");
    expect(walked["Unscoped.id"]).toBe("anyone");
  });
});
