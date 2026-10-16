# 0009: Local development against containers, real AWS only through the pipeline

- **Status:** Decided; the stand-ins table and the local run of the system are superseded by 0018 on 2026-10-16. The rule that the hub's data-layer tests run against Testcontainers stays.
- **Date:** 2026-10-14

## Decision

Unit tests, integration tests and a full local run of the system need no AWS account and no secrets. Anything against real AWS happens in `heat-dev`, deployed by the pipeline after a merge to `main`, never from a laptop. An agent, whose AWS access is read only, can therefore run everything a developer runs locally.

Locally, each AWS dependency has a stand-in started by the application's own tooling from one compose file at the repository root:

| Dependency | Stand-in |
| --- | --- |
| Postgres (while the design has one) | the official `postgres` image, wired by Spring Boot's Docker Compose support |
| DynamoDB | `amazon/dynamodb-local`, AWS's own image |
| S3 | Adobe S3Mock (Apache 2.0) |
| SQS | ElasticMQ (Apache 2.0) |
| API Gateway WebSocket API, Lambda invocation, the SQS trigger | `serverless-offline` with `serverless-offline-sqs` (MIT), configured from a `local/` directory that is never deployed; Terraform owns the real gateway |
| Cognito | the real `heat-dev` user pool: Cognito allows `http://localhost` callback URLs for testing, and the browser app client is a public client with the code grant and PKCE, so a local run needs only the pool id and client id. Offline tests validate tokens signed with a locally generated key |

Two rules make every cross-component flow run locally on the production code path:

1. **Every AWS call goes through an SDK client whose endpoint and credential source are configuration.** The code never branches on where it is running. Locally the endpoints are `localhost` ports and the credentials are the throwaway `test`/`test` the stand-ins ignore.
2. **Everything AWS would invoke as a Lambda is a plain exported function.** Lambda calls it with an event in AWS; the emulator calls it with the same event shape locally.

A test of the hardest flow, a GraphQL mutation by one player that ends in a WebSocket push to another, runs end to end against the containers with nothing mocked in the code. What such a test cannot prove, the real event shapes, the real IAM permissions and the real network path, is proven by the pipeline's smoke test in `heat-dev` after every merge. When the emulator and the real service disagree, the emulator is made more faithful; the code is never special-cased.

Integration tests use Testcontainers so each run gets fresh containers, on a laptop or on GitHub's hosted runners, which have Docker.

## Considered and not chosen

**LocalStack.** Its free tier covers S3 and SQS but is licensed for non-commercial use only, and the WebSocket API, Cognito and ECS are in the paid tier at about $470 a year. The licence turns on the project's commercial status, which is one more thing to track, and the paid features are unnecessary once sign-in uses the real dev pool. Every service it would have provided has a licence-free stand-in.

**Mocking the SDK client inside the service.** Tests the resolver and nothing after it; it is where "works locally, fails in AWS" comes from.

**A development token issuer of our own** in place of real Cognito. Unnecessary once it was checked that Cognito accepts localhost callbacks; the issuer shrank to a test key.

**Running the laptop against live `heat-dev` through a tunnel.** Workable: the data-plane services have public endpoints, and EC2 Instance Connect Endpoint is a free, IAM-authorised TCP proxy into the VPC. It gives the best debugger experience for a boundary problem. It needs write credentials on the laptop, which the agent may not hold, and it interferes with the deployed dev service, which shares the queues and tables. Kept as an optional mode to build after the first deployment, not as the baseline, because tests and the agent need the local stack regardless.

**AWS SAM CLI** for the gateway. Official and free, but it has never supported WebSocket APIs locally.

## Where it is described

`docs/architecture/overview.md`, "Environments". The compose file and `local/` directory once they exist.
