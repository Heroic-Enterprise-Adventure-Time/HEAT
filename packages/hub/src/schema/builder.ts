import SchemaBuilder from "@pothos/core";
import ScopeAuthPlugin from "@pothos/plugin-scope-auth";
import type { Context } from "../context.js";

/**
 * Pothos, code-first, with scope-auth for field-level authorization.
 * Two scopes: `authenticated` (any signed-in player) and `self` (the field's
 * owner is the caller). Scopes are declared on types and fields and resolved
 * once per request; a field the caller may not read is an error for that
 * field, not for the whole query.
 *
 * Fields are non-null unless declared `nullable: true`, so the printed
 * contract says what is guaranteed rather than defaulting to "maybe".
 */
export const builder = new SchemaBuilder<{
  Context: Context;
  DefaultFieldNullability: false;
  AuthScopes: {
    authenticated: boolean;
    self: string;
  };
  Scalars: {
    // A stored timeline, display only and a union of many event types, is
    // served as the JSON it was written as (Issue-114).
    JSON: { Input: unknown; Output: unknown };
  };
}>({
  plugins: [ScopeAuthPlugin],
  defaultFieldNullability: false,
  scopeAuth: {
    authScopes: (ctx) => ({
      authenticated: ctx.playerId !== undefined,
      self: (ownerId: string) => ctx.playerId === ownerId,
    }),
  },
});

builder.queryType({
  description: "What a signed-in player reads: a player by id, themselves, the deploy's version, an adventure, and the heroes other players have left at a location.",
});
builder.mutationType({
  description: "What a signed-in player does: joins the game, recruits and retires heroes, builds a facility, and starts, submits and discards an adventure.",
});
