# 0012: The hub is TypeScript on Lambda, with Apollo Server and Pothos

- **Status:** Decided; built: the hub by Issues 36 to 155, the API's shape by Issue-155 (decision 0038), the generated client and Apollo Angular by Issue-156 (2026-11-02)
- **Date:** 2026-10-14, recorded 2026-10-15
- **Supersedes:** 0004

## Decision

The GraphQL hub is one TypeScript Lambda function behind the HTTP API: Apollo Server through its Lambda integration, a Pothos code-first schema, and the scope-auth plugin for field-level authorization. The printed schema is committed, GraphQL Code Generator produces the client's types from it, and the Angular client uses Apollo Angular. The engine is imported as a library; the hub never invokes another Lambda to run shared logic. The hub remains the only API for core requests and the one place authorization is enforced.

Lambdas serve everything. The direction recorded in the overview on 2026-10-08, that Lambdas do not serve the core requests, is superseded with this record.

What this changes in earlier records:

- **0010.** The VPC link and Cloud Map discovery are moot; the HTTP API integrates with the function directly. Everything else in 0010 stands.
- **0011.** The code artifacts are two, not four: one bundle per function, uploaded straight to the function since every bundle is far under Lambda's 50 MB direct-upload limit, and the browser client synced to its bucket. There is no hub image, no container registry in `heat-platform`, and no database migration step.

## Considered and not chosen

**Spring Boot GraphQL in a container on Fargate**, the 0004 shape. About $27 a month idle per environment with its database, a VPC with an egress question, and two languages: the engine is TypeScript because the browser runs it, so a Java hub could not verify an adventure itself and needed a separate verifier Lambda and a queue (see 0014).

**Spring Boot GraphQL on Lambda with SnapStart.** Removes the idle cost but keeps the two languages and the separate verifier.

**AWS AppSync.** Managed GraphQL with its own resolver model. No faithful local emulator, so decision 0009's rule that every flow runs locally on the production code path would not hold, and the hub's logic would be shaped around AppSync's resolvers rather than a code-first schema.

**GraphQL Yoga** in place of Apollo Server. Equally capable and lighter. Apollo was chosen for its first-party Lambda integration and first-party Angular client, so the server and the client come from one vendor.

**Schema-first with generated resolver types.** Pothos code-first keeps the types in one place; committing the printed schema keeps schema-first's one real advantage, a reviewable contract.

## Where it is described

`docs/architecture/overview.md`, "Services and data". `docs/standards/typescript.md`, rules 10 to 12; `docs/standards/angular.md`, rules 4 and 5. `packages/hub`; `codegen.mjs` and `packages/client/src/app/hub.ts`.
