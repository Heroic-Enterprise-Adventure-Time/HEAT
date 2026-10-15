# Running HEAT locally

Everything runs on the laptop with no AWS credentials (decision 0009). What is needed: Docker, Node 24 (the major in `.node-version`, which `fnm` reads), and a Serverless Framework sign-in or licence key for the emulator.

## What runs where

| Piece | How | Port |
| --- | --- | --- |
| DynamoDB | `amazon/dynamodb-local` container from `compose.yml` | 8000 |
| The hub (GraphQL Lambda) | `serverless-offline`, from `serverless.yml`, running the handler in `packages/hub` | 3000 |
| Sign-in | the real `heat-dev` Cognito user pool; the emulator passes the token's claims through to the handler | |

The functions and routes the emulator serves are read from `manifest.json`. Terraform reads the same file for the real ones, so the two cannot drift.

## Start

```powershell
docker compose up -d
$env:HEAT_COGNITO_ISSUER = "<the heat-dev pool's issuer URL>"
$env:HEAT_COGNITO_CLIENT_ID = "<the browser app client id>"
npm run local:api
```

Then `POST http://localhost:3000/graphql` with an `Authorization: Bearer <token>` header from the dev pool. The table `heat-local` is created on first use by the handler's test helper; for a clean slate, `docker compose down` and up again, since the container keeps its data in memory.

## Tests

`npm test` at the repository root runs every package's tests. The hub's tests start their own DynamoDB Local container through Testcontainers and do not use `compose.yml`, so they run the same way on a laptop and on CI.
