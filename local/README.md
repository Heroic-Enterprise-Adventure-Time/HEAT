# Running HEAT locally

Everything runs on the laptop with no AWS credentials (decision 0009). What is needed: Docker Desktop running, Node 24 (the major in `.node-version`, which `fnm` reads), and a Serverless Framework sign-in or license key, once per machine, for the emulator (`serverless login`; the framework stores it in the home directory).

## What runs where

| Piece | How | Port |
| --- | --- | --- |
| DynamoDB | `amazon/dynamodb-local` container from `compose.yml` at the repository root | 8000 |
| The hub (GraphQL Lambda) | `serverless-offline`, configured by `serverless.ts`, loading the handler in `packages/hub` straight from its TypeScript source through tsx and serving it behind an emulated HTTP API; the framework's own build step is off | 3000, and 3002 for the Lambda invoke endpoint |
| Sign-in | the real `heat-dev` Cognito user pool; see below for what the emulator checks | |

The functions and routes the emulator serves are built from `manifest.json` at the repository root. The bundler and Terraform read the same file (`docs/standards/typescript.md`, rule 4), so the three cannot drift. The handler's environment, the table name and the DynamoDB endpoint, is in `environment.ts`, which the table script below also reads.

## Start

```powershell
docker compose up -d
npm run local:table
$env:HEAT_COGNITO_ISSUER = "https://cognito-idp.us-east-1.amazonaws.com/<the heat-dev pool id>"
$env:HEAT_COGNITO_CLIENT_ID = "<the browser app client id>"
npm run local:api
```

`local:table` creates the `heat-local` table in the container with the same definition the integration tests use. The container keeps its data in memory, so for a clean slate run `docker compose down`, then the first two commands again.

Then `POST http://localhost:3000/graphql` with an `Authorization: Bearer <token>` header. The two values above are outputs of the environment stack (`terraform/environment/dev`), which issue #13 creates; until it is applied there is no pool to sign in to.

## What the emulator checks, and what it does not

serverless-offline runs the JWT authorizer with its `ignoreJWTSignature` option on, which is the only mode in which it runs the authorizer at all. In that mode it rejects a request with 401 when the token is missing or malformed, expired, not from `HEAT_COGNITO_ISSUER` or not for `HEAT_COGNITO_CLIENT_ID`, and otherwise passes the token's claims to the handler in the same field the real gateway uses. It never verifies the token's signature, so on the laptop a hand-made token with the right claims is accepted. The real gateway verifies signatures, and the pipeline's smoke test in `heat-dev` proves that path after every merge (decisions 0009 and 0017). The handler itself never sees the token and never validates it, in AWS or here.

## The framework

`serverless` and `serverless-offline` are exact dev dependencies at the repository root. The `serverless` package is a launcher: the first `npm run local:api` downloads its binary into `node_modules`, and that binary downloads the framework release named by `frameworkVersion` in `serverless.ts` into `~/.serverless/releases`. Its install script is recorded as denied in the root `package.json`, since it only pre-downloads what that first run downloads anyway, and CI never runs the emulator. The release is pinned exactly; Dependabot does not see that field, so it is bumped by hand together with the launcher (`docs/standards/typescript.md`, rule 2).

The configuration is TypeScript rather than JavaScript because the framework loads a `.ts` file through tsx, which works on Windows, while its `.js` loader fails there (framework 4.44.0, checked 2026-10-16). `tsc -p local` typechecks the directory as part of `npm run typecheck`.

Serverless never deploys anything here. Terraform owns every function and gateway (decision 0011); the configuration carries no AWS credentials, and the agent's shell denies `serverless deploy`.

## Tests

`npm test` at the repository root runs every package's tests. The hub's tests start their own DynamoDB Local container through Testcontainers and do not use `compose.yml`, so they run the same way on a laptop and on CI.
