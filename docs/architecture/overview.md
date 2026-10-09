# Architecture

How the system delivers the game described in `docs/design/game.md`: services, data, and the flows between them. Nothing described here is built yet unless it says so.

Each item carries a status. **Decided** items are settled by the project owner. **Working assumption** items were proposed during design and not yet objected to: build on them, but expect them to be revisited. **Open** items are not yet answered.

## Services and data

- **Decided.** GraphQL with field-level authorization.
- **Decided.** Search and browse: which heroes of other players are at my location; which adventures other players recently completed here; view a replay.
- **Decided.** Amazon Cognito for sign-in.
- **Decided.** Nothing private goes into DynamoDB or S3.
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
- **Working assumption.** The smallest RDS Postgres instance. Prices have not been checked yet.

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

- **Decided (direction).** Lambdas do not serve the core requests, but may serve a live channel for a location.
- **Working assumption.** An API Gateway WebSocket API with Lambda handlers and a DynamoDB table of connections per location. A Lambda authorizer on `$connect` verifies the Cognito token, which travels in the query string or the subprotocol header because browsers cannot set headers on a WebSocket. The same channel carries verification results and a live feed of completed adventures.

## Engine provenance

The turn machinery (charge timers, action selection, abilities and tags, the seeded random number generator, events, stepping, overrides) is to be adapted from the author's earlier private project, BattleScript Online. The outer loop of stages, carry-over, cargo and retreat is new, as is replaying an override log, which the earlier project designed and did not build. Files that are copied or adapted will say so.

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
- The AWS account and Terraform state layout.
- The repository layout.
