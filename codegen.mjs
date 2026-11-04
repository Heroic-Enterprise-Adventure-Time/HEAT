// The client's GraphQL operations and types, generated from the committed
// schema (decision 0012; docs/standards/typescript.md, rule 11). The schema
// is the one input, so the client never reads a running hub to build; the
// operations are the `.graphql` files beside the client's data layer, one
// definition per file, and the generated code is committed beside them. Run
// through `npm run codegen`; CI fails if the committed output is stale, as
// it does for the schema.

/** @type {import("@graphql-codegen/cli").CodegenConfig} */
const config = {
  schema: "packages/hub/schema.graphql",
  documents: "packages/client/src/app/graphql/*.graphql",
  generates: {
    "packages/client/src/app/graphql/generated/": {
      preset: "client",
      presetConfig: {
        // Masking serves components that colocate their own fragments; here
        // one service reads every result and derives the views from the
        // fragments' types (docs/standards/angular.md, rule 5).
        fragmentMasking: false,
      },
      // The engine's sets travel as the schema's enums, each a union of its
      // names (the preset's default), never a TypeScript enum; the client
      // maps them back at its boundary (docs/standards/graphql.md, rule 4).
      config: {
        immutableTypes: true,
        useTypeImports: true,
        // Every scalar the schema declares is typed here, or generation fails.
        strictScalars: true,
        scalars: {
          DateTime: "string",
          // The engine's own AdventureTimeline, which the client narrows where it reads it.
          JSON: "unknown",
          UUID: "string",
          NonNegativeInt: "number",
          PositiveInt: "number",
        },
      },
    },
    // The union and interface members, which the cache needs to match a
    // fragment on `Error` or on a result union.
    "packages/client/src/app/graphql/generated/possible-types.ts": {
      plugins: ["fragment-matcher"],
    },
  },
};

export default config;
