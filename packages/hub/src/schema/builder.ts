import SchemaBuilder from "@pothos/core";
import ErrorsPlugin from "@pothos/plugin-errors";
import ScopeAuthPlugin from "@pothos/plugin-scope-auth";
import { GraphQLError } from "graphql";
import { DateTimeResolver } from "graphql-scalars";

import { type Context, notSignedIn } from "../context.js";

/**
 * Pothos, code-first, with scope-auth for field-level authorization and the
 * errors plugin for the result unions (docs/standards/graphql.md, rules 6
 * and 11). Two scopes: `authenticated` (any signed-in player) and `self`
 * (the field's owner is the caller). Scopes are declared on types and fields
 * and resolved once per request; a field the caller may not read is an error
 * for that field, not for the whole query. The plugin's own error keeps its
 * code off `extensions`, where Apollo would answer INTERNAL_SERVER_ERROR, so
 * the refusal is built here: UNAUTHENTICATED for a caller not signed in,
 * FORBIDDEN for one signed in who failed the scope (rule 11).
 *
 * Fields are non-null unless declared `nullable: true`, so the printed
 * contract says what is guaranteed rather than defaulting to "maybe".
 *
 * The errors plugin registers no default error class: only the refusal
 * classes a mutation names (`src/refusals.ts`) become data, and every other
 * throw stays in the response's `errors` array. It is listed first, as its
 * documentation asks, so that it wraps the fields before the other plugins
 * do.
 */
export const builder = new SchemaBuilder<{
  Context: Context;
  DefaultFieldNullability: false;
  AuthScopes: {
    authenticated: boolean;
    self: string;
  };
  Scalars: {
    // Every id the hub issues is a string, so the ID scalar is typed as one
    // on both sides, not as graphql-js's string-or-number.
    ID: { Input: string; Output: string };
    // graphql-scalars' DateTime: RFC 3339 on the wire; the hub stores ISO
    // strings and the resolver serializes either a Date or such a string.
    DateTime: { Input: Date; Output: Date | string };
    // A stored timeline, display only and a union of many event types, is
    // served as the JSON it was written as (Issue-114).
    JSON: { Input: unknown; Output: unknown };
  };
}>({
  plugins: [ErrorsPlugin, ScopeAuthPlugin],
  defaultFieldNullability: false,
  scopeAuth: {
    authScopes: (ctx) => ({
      authenticated: ctx.playerId !== undefined,
      self: (ownerId: string) => ctx.playerId === ownerId,
    }),
    unauthorizedError: (_parent, ctx, _info, { message }) =>
      ctx.playerId === undefined ? notSignedIn() : new GraphQLError(message, { extensions: { code: "FORBIDDEN" } }),
  },
  errors: {
    defaultTypes: [],
  },
});

builder.addScalarType("DateTime", DateTimeResolver);

builder.queryType({
  description: "What a signed-in player reads: a player by id, themselves, the deploy's version, an adventure, and the heroes other players have left at a location.",
});
builder.mutationType({
  description: "What a signed-in player does: joins the game, recruits and retires heroes, builds a facility, and starts, submits and discards an adventure.",
});
