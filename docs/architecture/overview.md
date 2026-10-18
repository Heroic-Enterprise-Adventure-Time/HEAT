# Architecture

How the system delivers the game described in `docs/design/game.md`: services, data, and the flows between them. Nothing described here is built yet unless it says so. What exists on 2026-10-15 is the spike under `packages/`: the engine as a package, the hub with start and a spike-only settle mutation, the single-table layout and the three transactions, proven by integration tests against DynamoDB Local under forced conflicts. Nothing is deployed before the sandbox base of Issue-37; each stack's README under `terraform/` says whether it is applied.

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
  | Players, heroes, holdings and facilities per location, the materials ledger, the open-adventure item | DynamoDB, the player table | the hub |
  | Adventure records: status, seed, frozen snapshot, result, location, time; later the location feed, presence, offers and shared projects | DynamoDB, the location table | the hub at start and at submit |
  | Replay timelines | S3 | the hub at submit |
  | Static content: unit types, jobs, abilities, locations | the engine package, as TypeScript data | the repository; imported by the client and the hub |

  Two tables, each named for its partition key (decision 0023): the player table, one item collection per player, private and read only through the hub; the location table, one collection per location and the adventure records by id, public. Both exist from the first sandbox stack, and start and settle write to both in one transaction. The location view (step 3) adds the location collections and one index for replays by job. Every new access pattern is designed as a key or an index before its feature is built; an entity growing richer or a new item type costs no table change, a new partition key would.

- **Working assumption.** The flow:
  1. **Start.** The hub validates the party, issues the seed and the frozen snapshot, and writes the adventure record and the open-adventure item in one transaction. Proven in the spike.
  2. **Play.** The browser runs the engine and collects overrides. No request is made between start and submit.
  3. **Submit.** One request. The hub replays the override log from the snapshot and seed with the engine, writes the timeline to S3, and settles: one transaction clears the open-adventure item, marks the record settled and credits the rewards to the ledger, every write conditional, so a repeated submit cannot pay twice (decision 0014). The response carries the result. The settlement transaction is proven in the spike; the replay is not built.
  4. **Replay.** The client fetches the stored timeline and plays it back.
- **Working assumption.** The engine advances on a clock its caller drives. The browser feeds it wall-clock time; the hub feeds it the next event, so verifying a ten-minute adventure takes milliseconds. No timer inside the engine waits for real time. This is checked when the turn machinery is ported.
- **Working assumption.** Private causes, such as which facility granted a bonus, are resolved by the hub at start into the snapshot's effective numbers and are never recorded in the timeline.
- **Working assumption.** The engine is one TypeScript package in this repository, used by both the Angular client and the hub.
- **Decided.** The hub's cold start, measured on 2026-10-17 on the first sandbox stack (`heat-sb38`, Issue-38), the first request after the deploy: 627 ms of initialization, then 234 ms for the request itself; warm requests about 50 ms; 127 MB used of 1024; arm64; a 4.1 MB unminified bundle holding the SDK, Apollo, Pothos and Powertools, with tracing active. Acceptable for a game request, so nothing is bought: no provisioned concurrency. The levers if it grows: minify the bundle, leave the source map out of the zip, trim imports. Reported on every deploy in the run summary by the stack test, so the number is watched rather than remeasured.

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

What exists and what is still to be built is in the build order below; each stack's README says whether it is applied.

- **Decided.** Four AWS accounts, owned by the Double Cobra Games organization and placed by it: `heat-platform` for Terraform state; `heat-sandbox` for the per-issue sandbox stacks; `heat-dev` and `heat-prod` for the two permanent environments. The organization layer, in the `dcg-platform` repository, enrolls them in Control Tower, applies the organization's controls to them, and places in each workload account a `PlatformAdminRole` that only `heat-platform` may assume. Everything inside the accounts beyond that role is HEAT's. There is no container registry (decision 0012). All four accounts exist; `heat-sandbox` was created by the organization layer on 2026-10-16.
- **Decided.** Every stack keeps its state in `heat-platform`, in one S3 bucket with one key per stack and environment (decision 0008). The `backend` and `bootstrap` stacks run from `heat-platform` under the owner's session and reach the workload accounts through `PlatformAdminRole`. An environment is applied by HEAT's own apply role in its workload account, which the bucket's policy lets read and write its own keys (decision 0017).
- **Decided.** Account ids are not committed. Stacks take the account id as a variable, from an ignored file on the owner's machine or from the repository's GitHub Actions variables in the pipeline (`docs/README.md`, rule 9).
- **Decided.** The pipeline applies Terraform, and Terraform owns the function code: each function's zip is passed with its hash, every change publishes a version, and the alias follows the version, so a change that needs a table, a permission and code is one plan. A push to a working branch applies that branch's sandbox stack; a merge to `main` applies `dev`; a merge to `release`, through a pull request that carries the `prod` plan, applies `prod`, and the workflow then writes a date-based `v*` tag and a GitHub Release as documentation (decision 0021). A pull request to `main` carries the `dev` plan, run under the `dev` environment with its real values (decision 0020). Workflows assume roles through GitHub's OIDC provider: in each workload account a read-only plan role for the pull requests' plans and a bounded apply role, both HEAT's own, created by the `bootstrap` stack. The apply role is an administrator under a permissions boundary that allows only the services the shape uses, denies outright the ones that cost money while idle, and is carried by every role an environment creates; a plan-time allow-list of resource types fails the run on anything else; the account budget attaches a deny-all policy to the apply role when exceeded; every apply's plan is in the run summary (decisions 0017 and 0019). The plan role is read only and sees configuration, never data; the agent assumes it from its audit chain to plan a change before pushing it. The code artifacts are one bundle per function and the browser client (decision 0012).
- **Decided.** Every working branch has a sandbox stack, `heat-sb<issue>`, named from the issue number in the branch name, created by the push at the branch's creation, re-applied on every push, destroyed when the branch is deleted and by a weekly sweep of orphans, under a cap of 5 concurrent stacks (`.github/workflows/sandbox.yml`, `docs/process/development.md`). A permanent `sandbox-base` root, applied from `main` under its own GitHub environment, holds what the stacks share: the zone `heat-sb.dcg-games.com`, one wildcard certificate (created in Issue-39, once the zone is delegated), one Cognito user pool with a password-flow app client for end-to-end tests, and test users that the apply job creates from a committed list. Google is registered in the pool by Issue-46, with one OAuth client per pool. Each stack adds a browser app client to that pool with its own callback URLs (decision 0018 and its amendments).
- **Decided.** One hostname per environment, which is a CloudFront distribution: `<issue>.heat-sb.dcg-games.com` per sandbox stack, `heat-dev.dcg-games.com` and `heat.dcg-games.com`. The distribution serves the client from its bucket, routes `/graphql` to the environment's HTTP API and, once the live channel exists, the socket's path to its WebSocket API, so the browser has one origin and the APIs have no hostname of their own. No load balancer (decisions 0010, 0015 and 0018).
- **Decided.** Nothing emulates AWS. The system runs in a sandbox stack; the fast loop on the laptop is the engine's unit tests and the hub's data-layer tests against DynamoDB Local started by Testcontainers, with no AWS credentials. Every AWS call still goes through an SDK client whose endpoint is configuration, which is what lets those tests point at the container, and every Lambda is a plain function (decision 0009 as amended by 0018). For display work the Angular dev server runs locally against a stack, signing in through the stack's app client with a localhost callback. The emulator was removed in Issue-38; `docs/process/development.md` describes the loop.
- **Decided.** Non-secret per-environment configuration is written by Terraform: into the functions' environment variables for the runtime, and into Parameter Store under `/heat/<stack>/` (`api_url`, `user_pool_id`, `app_client_id`) for whatever calls the stack; the repository holds names, never per-environment values. Runtime secrets, if any, are injected from Secrets Manager into the runtime and never cross a laptop or a log. The serverless shape needs none today: Cognito, DynamoDB and S3 are reached under the function's role.
- **Decided.** Infrastructure secrets, today the pool's Google client secret and the test users' password, live in the GitHub environment of the deployment they belong to and enter AWS through that account's base root, as Terraform variables under the environment. Where the resource is a secret store, the value is written with a write-only argument and never enters state; where the resource needs the raw value, it is in that root's state, which the same identities could read from the service anyway. Environment roots never take a secret value. The one exception to "never cross a laptop" is a git-ignored copy of the sandbox base's secrets for local plans (decision 0020).
- **Working assumption.** No VPC in any environment. Every function runs outside a VPC and reaches AWS services over their public endpoints under its role.
- **Decided.** The Terraform stacks in this repository: `backend` (applied); `bootstrap`, one root per account (applied in all three on 2026-10-16), creating the plan and apply roles and the budget with its action; `sandbox-base`, one root composing the `base` module, the first stack the pipeline applies (Issue-37; its README says whether it has been); `environment`, with a root per permanent environment, `dev` and `prod`, each composing the `base` and `environment` modules, and one root for every sandbox stack, `terraform/environment/sandbox`, which takes the issue number as a variable and its state key from `scripts/sandbox.mjs` (Issue-38, applied by `sandbox.yml`). The permanent roots have their state key written into their backend block, and applying one is entering its directory with no flag selecting anything (decision 0016, amended by 0018 for the sandbox root). The resources live in modules under `terraform/modules/`. Never Terraform workspaces, which share one backend and are not an isolation mechanism. Each stack's README says what it manages and whether it is applied.
- **Working assumption.** The functions are the hub, the WebSocket handler and its authorizer. Each is an entry in the manifest, bundled on its own with the shared packages compiled in; there are no layers (`docs/standards/typescript.md`, rule 12). Each runs on arm64 with its memory and timeout from the manifest, logs JSON lines through the Powertools logger, traces through X-Ray with its SDK calls captured, and holds an execution role under the boundary with the least it needs; the HTTP API is throttled per environment and its access log shows what the authorizer refused.

## Build order

**Working assumption:**

1. Platform, in this order: the pipeline's plan and apply roles per account with their guardrails (Issue-36, done); the sandbox base, the zone and the pool with its test users, and the workflow's plan-and-apply path (Issue-37); the environment module proven on a per-issue sandbox stack, with the emulator removed and the cold start measured (Issue-38), beside the Angular client skeleton with a home page (Issue-45); a site per stack with the wildcard certificate (Issue-39); sign-in with Google from the home page (Issue-46); `dev` through the pipeline (Issue-40); `prod` through the release branch (Issue-41).
2. Core loop: start, play, submit, replay.
3. Location view: heroes here, recent adventures, private holdings and facilities.
4. Live feed and canned actions.
5. Cooperation.
6. Reporting pipeline.

## Open

- The access patterns and indexes for the location view, designed before step 3 (decision 0013).
