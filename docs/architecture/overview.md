# Architecture

How the system delivers the game described in `docs/design/game.md`: services, data, and the flows between them. Nothing described here is built yet unless it says so. What exists on 2026-10-15 is the spike under `packages/`: the engine as a package, the hub with start and a spike-only settle mutation, the single-table layout and the three transactions, proven by integration tests against DynamoDB Local under forced conflicts. Nothing is deployed.

Each item carries a status. **Decided** items are settled by the project owner. **Working assumption** items were proposed during design and not yet objected to: build on them, but expect them to be revisited. **Open** items are not yet answered.

## Services and data

- **Decided.** GraphQL with field-level authorization.
- **Decided.** Search and browse: which heroes of other players are at my location; which adventures other players recently completed here; view a replay.
- **Decided.** Amazon Cognito for sign-in.
- **Decided.** Player-private data and public game data are kept apart: separate tables with separate access roles, and every request for private data goes through the GraphQL hub, which is where authorization is answered. (Restated 2026-10-14 from "nothing private goes into DynamoDB or S3": the intent was always the separation, not the choice of store.)
- **Decided.** A reporting pipeline comes after the rest is further along, not first.
- **Decided.** The hub is one TypeScript Lambda function behind the HTTP API: Apollo Server through its Lambda integration, a Pothos code-first schema, and the scope-auth plugin for field-level authorization. It is the only API for core requests and the one place authorization is enforced. It imports the engine as a library (decision 0012). Lambdas serve everything; there is no container anywhere.
- **Decided.** No relational store. All data is in DynamoDB and S3, and no function runs inside a VPC (decision 0013).
- **Working assumption.** The browser signs in with the authorization code flow and PKCE, and the API validates the tokens.
- **Working assumption.** Data ownership:

  | Data | Store | Written by |
  | --- | --- | --- |
  | Players, holdings, the materials ledger, the open-adventure item | DynamoDB, the private table | the hub |
  | Adventure records: status, seed, frozen snapshot, result, location, time | DynamoDB, the public table | the hub at start and at submit |
  | Replay timelines | S3 | the hub at submit |
  | Static content: unit types, jobs, abilities, locations | the engine package, as TypeScript data | the repository; imported by the client and the hub |

  The spike uses one table for everything. It is split into the private and public tables, each with its own role, when the location view is built, which is the first feature that reads public data.

- **Working assumption.** The flow:
  1. **Start.** The hub validates the party, issues the seed and the frozen snapshot, and writes the adventure record and the open-adventure item in one transaction. Proven in the spike.
  2. **Play.** The browser runs the engine and collects overrides. No request is made between start and submit.
  3. **Submit.** One request. The hub replays the override log from the snapshot and seed with the engine, writes the timeline to S3, and settles: one transaction clears the open-adventure item, marks the record settled and credits the rewards to the ledger, every write conditional, so a repeated submit cannot pay twice (decision 0014). The response carries the result. The settlement transaction is proven in the spike; the replay is not built.
  4. **Replay.** The client fetches the stored timeline and plays it back.
- **Working assumption.** The engine advances on a clock its caller drives. The browser feeds it wall-clock time; the hub feeds it the next event, so verifying a ten-minute adventure takes milliseconds. No timer inside the engine waits for real time. This is checked when the turn machinery is ported.
- **Working assumption.** Private causes, such as which facility granted a bonus, are resolved by the hub at start into the snapshot's effective numbers and are never recorded in the timeline.
- **Working assumption.** The engine is one TypeScript package in this repository, used by both the Angular client and the hub.
- **Open.** The hub's cold start. It is measured by the first deployment. If it is too slow for a game request, the remedy is provisioned concurrency for one instance in production; nothing is bought until the number is known.

## The adventure loop

- **Working assumption.** The server issues the seed and a frozen snapshot of the party and job at start, so a client cannot choose its seed.
- **Working assumption.** The browser submits only its override log. The hub regenerates the timeline, so the stored replay is always produced by the server.
- **Working assumption.** Each adventure is pinned to the rules version it was issued under. The hub only runs the current version, and anything older is discarded at submit. This is how client and server are kept from disagreeing about the rules.
- **Working assumption.** The one-adventure rule is one conditional item per player in DynamoDB. Starting an adventure puts it if absent, or returns the one already open. Settlement deletes it in the same transaction that credits rewards. Proven in the spike under concurrent starts.
- **Working assumption.** Resuming replays the override log so far up to the saved point, using the same replay entry point the hub uses to verify. The log in progress is kept in the browser. If it is lost, the run restarts from the beginning with the same seed.

### What verification proves

The client holds the seed, so a modified client can try override sequences offline and submit the best one. Verification proves that the outcome is reachable under the rules with that seed. It does not prove that a person played it live. Closing that gap would mean the server revealing randomness stage by stage, which is the per-step traffic this design avoids.

## Private holdings

- **Working assumption.** Materials move through an append-only ledger keyed on the adventure id. Building a facility debits materials in one transaction whose condition rejects a negative balance; the debit is proven in the spike under concurrent attempts. Facilities gate which jobs can be started, checked by the hub at start. A cart job moves goods between two locations' holdings.

## Live location channel

- **Decided.** An API Gateway WebSocket API with one Lambda function serving connect, disconnect and default by route key, a Lambda authorizer on `$connect` that verifies the Cognito token, which travels in the query string or the subprotocol header because browsers cannot set headers on a WebSocket, and a DynamoDB table of connections per location. The channel carries the live feed of completed adventures and canned actions; the hub pushes through the gateway's callback API. Verification results do not travel here: they return in the submit response (decision 0014). The direction recorded on 2026-10-08, that Lambdas serve the live channel but not the core requests, is superseded by decision 0012.

## Engine provenance

The turn machinery (charge timers, action selection, abilities and tags, the seeded random number generator, events, stepping, overrides) is to be adapted from the author's earlier private project, BattleScript Online. The outer loop of stages, carry-over, cargo and retreat is new, as is replaying an override log, which the earlier project designed and did not build. Files that are copied or adapted will say so.

## Environments

- **Decided.** Three AWS accounts, owned by the Double Cobra Games organization and placed by it: `heat-platform` for Terraform state and the platform deploy role; `heat-dev` and `heat-prod` for the workloads. The organization layer, in the `dcg-platform` repository, enrolls them in Control Tower, applies the organization's controls to them, and places in each workload account a `PlatformAdminRole` that only `heat-platform` may assume. Everything inside the accounts beyond that role is HEAT's. There is no container registry (decision 0012).
- **Decided.** Every HEAT stack runs from `heat-platform` and keeps its state there, in one S3 bucket with one key per stack and environment (decision 0008). Stacks reach `heat-dev` and `heat-prod` by assuming `PlatformAdminRole`.
- **Decided.** Account ids are not committed. Stacks take the account id as a variable from an ignored file (`docs/README.md`, rule 9).
- **Decided.** Code reaches an environment through GitHub Actions, infrastructure through Terraform applied by the owner, and the two never cross. `dev` deploys on merge to `main`; `prod` deploys on a `v*` tag that only the owner can create. Workflows assume roles through GitHub's OIDC provider: the platform deploy role in `heat-platform`, a narrow deploy role in each workload account (decision 0011). The code artifacts are one bundle per function and the browser client (decision 0012).
- **Decided.** The API is reached only through an API Gateway per environment, an HTTP API for GraphQL and a WebSocket API for the live channel, on `heat.dcg-games.com` and `heat-dev.dcg-games.com`; the client is a static site on S3 behind CloudFront. No load balancer (decisions 0010 and 0015).
- **Decided.** Local development and all tests run against containers and an emulator with no AWS credentials; real AWS is reached only through the pipeline into `heat-dev`. Every AWS call goes through an SDK client whose endpoint is configuration, and every Lambda is a plain function (decision 0009). The stand-ins the serverless shape needs are DynamoDB Local and S3Mock; the Postgres and SQS rows in decision 0009's table are history.
- **Decided.** Non-secret per-environment configuration lives in Parameter Store, written by Terraform and read into the runtime; the repository holds names, never per-environment values. Secrets, if any, are injected from Secrets Manager into the runtime and never cross a laptop or a log. The serverless shape needs none today: Cognito, DynamoDB and S3 are reached under the function's role.
- **Working assumption.** No VPC in any environment. Every function runs outside a VPC and reaches AWS services over their public endpoints under its role.
- **Working assumption.** Three Terraform stacks in this repository, each with its own state: `backend` (applied), `bootstrap` once per account, `environment` once per environment. The bootstrap and environment stacks are one configuration each, applied per account or environment with a committed variable file and a state key of its own, never with Terraform workspaces, which share one backend and are not an isolation mechanism. Each stack's README says what it manages and whether it is applied.
- **Working assumption.** The functions are the hub, the WebSocket handler and its authorizer. Each is an entry in the manifest, bundled on its own with the shared packages compiled in; there are no layers (`docs/standards/typescript.md`, rule 12).

## Build order

**Working assumption:**

1. Platform: the bootstrap stack, the environment stack, the deploy workflow, and one measured cold start.
2. Core loop: start, play, submit, replay.
3. Location view: heroes here, recent adventures, private holdings and facilities.
4. Live feed and canned actions.
5. Cooperation.
6. Reporting pipeline.

## Open

- The hub's cold start, measured in step 1 of the build order.
- The access patterns and indexes for the location view, designed before step 3 (decision 0013).
