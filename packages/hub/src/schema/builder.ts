import SchemaBuilder from "@pothos/core";
import ErrorsPlugin from "@pothos/plugin-errors";
import ScopeAuthPlugin from "@pothos/plugin-scope-auth";
import ValidationPlugin from "@pothos/plugin-validation";
import { GraphQLError, type GraphQLScalarType } from "graphql";
import { DateTimeResolver, JSONResolver, NonNegativeIntResolver, PositiveIntResolver, UUIDResolver } from "graphql-scalars";

import type { Context } from "../context.js";
import { badInput } from "../refusals.js";

/**
 * Pothos, code-first, with scope-auth for field-level authorization and the
 * errors plugin for the result unions (docs/standards/graphql.md, rules 6
 * and 11). Two scopes: `authenticated` (any signed-in player) and `self`
 * (the field's owner is the caller). Scopes are declared on types and fields
 * and resolved once per request; a field the caller may not read is an error
 * for that field, not for the whole query.
 *
 * Fields are non-null unless declared `nullable: true`, so the printed
 * contract says what is guaranteed rather than defaulting to "maybe".
 *
 * The errors plugin registers no default error class: only the refusal
 * classes a mutation names (`src/refusals.ts`) become data, and every other
 * throw stays in the response's `errors` array. It is listed first, as its
 * documentation asks, so that it wraps the fields before the other plugins
 * do.
 *
 * The validation plugin runs zod on what the scalars cannot say (rule 14). It
 * maps a field's arguments outside every plugin's wrapper, whatever the order
 * here, so input is checked before a scope is: what it can tell a caller is
 * the shape the printed schema publishes, and nothing of any player. A failure
 * is `badInput`, as every other malformed input is, and says which field and
 * why.
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
    // What the contract can say about an input by its type alone (rule 4).
    UUID: { Input: string; Output: string };
    NonNegativeInt: { Input: number; Output: number };
    PositiveInt: { Input: number; Output: number };
  };
}>({
  plugins: [ErrorsPlugin, ScopeAuthPlugin, ValidationPlugin],
  defaultFieldNullability: false,
  scopeAuth: {
    authScopes: (ctx) => ({
      authenticated: ctx.playerId !== undefined,
      self: (ownerId: string) => ctx.playerId === ownerId,
    }),
  },
  errors: {
    defaultTypes: [],
  },
  validation: {
    validationError: ({ issues }) =>
      badInput(issues.map(({ path = [], message }) => `${path.map((part) => String(typeof part === "object" ? part.key : part)).join(".")}: ${message}`).join("; ")),
  },
});

/**
 * graphql-scalars reads an integer variable with `parseInt`, so 1.5 would
 * arrive as 1 and "7abc" as 7. `Int` refuses both, and so does this contract:
 * a value that is not a whole number never reaches the library.
 */
function wholeNumbersOnly(scalar: GraphQLScalarType) {
  return {
    parseValue(value: unknown): number {
      if (!Number.isInteger(value)) throw new GraphQLError(`Value is not a whole number: ${String(value)}`);
      return scalar.parseValue(value) as number;
    },
  };
}

builder.addScalarType("DateTime", DateTimeResolver);
builder.addScalarType("JSON", JSONResolver);
builder.addScalarType("UUID", UUIDResolver);
builder.addScalarType("NonNegativeInt", NonNegativeIntResolver, wholeNumbersOnly(NonNegativeIntResolver));
builder.addScalarType("PositiveInt", PositiveIntResolver, wholeNumbersOnly(PositiveIntResolver));

builder.queryType({
  description: "What a signed-in player reads: a player by id, themselves, the deploy's version, an adventure, and the heroes other players have left at a location.",
});
builder.mutationType({
  description: "What a signed-in player does: joins the game, recruits and retires heroes, builds a facility, and starts, submits and discards an adventure.",
});
