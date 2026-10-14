# Architecture

How the system delivers the game described in `docs/design/game.md`: services, data, and the flows between them. Nothing described here is built yet unless it says so.

Each item carries a status. **Decided** items are settled by the project owner. **Working assumption** items were proposed during design and not yet objected to: build on them, but expect them to be revisited. **Open** items are not yet answered.

## Services and data

- **Decided.** GraphQL with field-level authorization.
- **Decided.** Search and browse: which heroes of other players are at my location; which adventures other players recently completed here; view a replay.
- **Decided.** Amazon Cognito for sign-in.
- **Decided.** Player-private data and public game data are kept apart: separate stores or schemas with separate access roles, and every request for private data goes through the GraphQL hub, which is where authorization is answered. (Restated 2026-10-14 from "nothing private goes into DynamoDB or S3": the intent was always the separation, not the choice of store.)
- **Decided.** A reporting pipeline comes after the rest is further along, not first.
- **Working assumption.** The browser signs in with the authorization code flow and PKCE, and the API validates the tokens.
- **Working assumption.** A Java GraphQL service (Spring Boot, in a container) is the hub and the only API for these requests. It reads Postgres, DynamoDB and S3, and it is the one place authorization is enforced. If one store is unavailable, GraphQL returns the rest along with errors.
- **Working assumption.** Data ownership:

  | Data | Store | Written by |
  | --- | --- | --- |
  | Players, heroes, unit types, jobs, locations, holdings, the open-adventure row | Postgres | Java service |
  | Adventure records: status, seed, frozen snapshot, result, location, time | DynamoDB | Java service at start; verifier at verification |
  | Replay timelines | S3 | Verifier |

- **Working assumption.** The flow:
  1. **Start.** The hub validates the party, issues the seed, and writes the adventure record and the open-adventure row.
  2. **Play.** The browser runs the engine and collects overrides.
  3. **Submit.** The override log is queued.
  4. **Verify.** A TypeScript Lambda replays from the snapshot, writes the timeline to S3, and marks the record with a conditional write.
  5. **Settle.** The hub consumes the verified event and applies rewards in Postgres, keyed on the adventure id so that redelivery cannot pay twice.
- **Working assumption.** The verifier never touches Postgres. The snapshot holds effective combat numbers, so the Lambda runs outside the VPC and holds no database connections. Private causes, such as which facility granted a bonus, are resolved by the hub at start and never recorded.
- **Working assumption.** The engine is one TypeScript package in this repository, used by both the Angular client and the verifier.
- **Working assumption.** The smallest RDS Postgres instance, `db.t4g.micro`, $11.68 a month in us-east-1 (price list, 2026-10-13), chosen over Aurora Serverless v2 for a predictable cost; a snapshot restore is the migration path if it proves too small. Held while the open question below about the hub and the store is answered.
- **Open.** Whether the hub runs as a container on Fargate or as one Spring Boot GraphQL Lambda with SnapStart, and whether the relational data lives in RDS Postgres, Aurora DSQL or DynamoDB. The serverless shape (one Lambda, DynamoDB only, no VPC) removes every networking question and idles at nearly nothing; DynamoDB transactions cover the ledger, the open-adventure row and settlement. Leaning that way as of 2026-10-14. It would reopen decisions 0004, 0005 and 0006 and the live-channel direction below, so it is settled by a spike before the environment stack is written: the data model on paper, every access pattern and the three transactions, and a SnapStart hello-world measured against DynamoDB under a forced conflict.

## The adventure loop

- **Working assumption.** The server issues the seed and a frozen snapshot of the party and job at start, so a client cannot choose its seed.
- **Working assumption.** The browser submits only its override log. The verifier regenerates the timeline, so the stored replay is always produced by the server.
- **Working assumption.** Each adventure is pinned to the rules version it was issued under. The verifier only runs the current version, and anything older is discarded. This is how client and verifier are kept from disagreeing about the rules.
- **Working assumption.** The one-adventure rule is a single row per player in Postgres. Starting an adventure either creates it or returns the one already open. Settlement clears it in the same transaction that credits rewards.
- **Working assumption.** Resuming replays the override log so far up to the saved point, using the same replay entry point the verifier needs. The log in progress is kept in the browser. If it is lost, the run restarts from the beginning with the same seed.
- **Open.** What happens to an adventure that was submitted but not yet verified when an update ships: discard it, or drain the queue before a deploy completes.

### What verification proves

The client holds the seed, so a modified client can try override sequences offline and submit the best one. Verification proves that the outcome is reachable under the rules with that seed. It does not prove that a person played it live. Closing that gap would mean the server revealing randomness stage by stage, which is the per-step traffic this design avoids.

## Private holdings

- **Working assumption.** Materials move through an append-only ledger keyed on the adventure id. Building a facility debits materials in one transaction, with a constraint against negative balances. Facilities gate which jobs can be started, checked by the hub at start. A cart job moves goods between two locations' holdings.

## Live location channel

- **Decided (direction).** Lambdas do not serve the core requests, but may serve a live channel for a location. Under review with the open question in "Services and data": if the hub itself becomes a Lambda, this direction is superseded by a new record.
- **Working assumption.** An API Gateway WebSocket API with Lambda handlers and a DynamoDB table of connections per location. A Lambda authorizer on `$connect` verifies the Cognito token, which travels in the query string or the subprotocol header because browsers cannot set headers on a WebSocket. The same channel carries verification results and a live feed of completed adventures.

## Engine provenance

The turn machinery (charge timers, action selection, abilities and tags, the seeded random number generator, events, stepping, overrides) is to be adapted from the author's earlier private project, BattleScript Online. The outer loop of stages, carry-over, cargo and retreat is new, as is replaying an override log, which the earlier project designed and did not build. Files that are copied or adapted will say so.

## Environments

- **Decided.** Three AWS accounts, owned by the Double Cobra Games organization and placed by it: `heat-platform` for Terraform state, artifacts, the container registry and the platform deploy role; `heat-dev` and `heat-prod` for the workloads. The organization layer, in the `dcg-platform` repository, enrolls them in Control Tower, applies the organization's controls to them, and places in each workload account a `PlatformAdminRole` that only `heat-platform` may assume. Everything inside the accounts beyond that role is HEAT's.
- **Decided.** Every HEAT stack runs from `heat-platform` and keeps its state there, in one S3 bucket with one key per stack (decision 0008). Stacks reach `heat-dev` and `heat-prod` by assuming `PlatformAdminRole`.
- **Decided.** Account ids are not committed. Stacks take the account id as a variable from an ignored file (`docs/README.md`, rule 9).
- **Decided.** Code reaches an environment through GitHub Actions, infrastructure through Terraform applied by the owner, and the two never cross. `dev` deploys on merge to `main`; `prod` deploys on a `v*` tag that only the owner can create. Workflows assume roles through GitHub's OIDC provider: the platform deploy role in `heat-platform`, a narrow deploy role in each workload account (decision 0011).
- **Decided.** The API is reached only through an API Gateway per environment, an HTTP API for GraphQL and a WebSocket API for the live channel, on `heat.doublecobra.com` and `heat-dev.doublecobra.com`; the client is a static site on S3 behind CloudFront. No load balancer (decision 0010).
- **Decided.** Local development and all tests run against containers and an emulator with no AWS credentials; real AWS is reached only through the pipeline into `heat-dev`. Every AWS call goes through an SDK client whose endpoint is configuration, and every Lambda is a plain function (decision 0009).
- **Decided.** Non-secret per-environment configuration lives in Parameter Store, written by Terraform and read into the runtime; the repository holds names, never per-environment values. Secrets are injected from Secrets Manager into the runtime and never cross a laptop or a log. If the store is RDS, its master password is created and rotated by RDS itself and the hub's own database user is injected the same way; IAM database authentication is deferred because the smallest instance's memory does not meet AWS's stated requirement for it.
- **Working assumption.** If the hub runs in a VPC, it reaches AWS services without a NAT gateway: a dual-stack VPC with an egress-only internet gateway if a test in `heat-dev` proves image pulls and SDK calls work over IPv6, otherwise public subnets with a public IP and a security group that admits only the gateway. If the hub is a Lambda outside any VPC, the question does not arise.
- **Working assumption.** Running a laptop against live `heat-dev` through an EC2 Instance Connect Endpoint tunnel is an optional mode built after the first deployment, not the baseline (decision 0009).
- **Working assumption.** Three Terraform stacks in this repository, each with its own state: `backend` (applied), `bootstrap` once per account, `environment` once per environment. Each stack's README says what it manages and whether it is applied.

## Build order

**Working assumption:**

1. Platform: a thin slice deployed through the full pipeline.
2. Core loop: start, play, submit, verify, settle, replay.
3. Location view: heroes here, recent adventures, private holdings and facilities.
4. Live feed and canned actions.
5. Cooperation.
6. Reporting pipeline.

## Open

- Where static content lives so that the TypeScript engine and the Java service agree on it.
- The repository layout.
