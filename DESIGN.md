# HEAT design

HEAT (Heroic Enterprise Adventure Time) is a browser game about running an adventuring business. It exists as a technical showcase: the game is deliberately simple, and the interest is in the data services behind it and the pipeline that delivers them.

This document is the authoritative record of the design. It is written before the code, and it is expected to change. Nothing described here is built yet unless a section says so.

Each item carries a status:

- **Decided**: settled by the project owner.
- **Working assumption**: proposed during design and not yet objected to. Build on it, but expect it to be revisited.
- **Open**: not yet answered.

Last updated: 2026-10-08.

---

## 1. Purpose and focus

- **Decided.** The focus is interesting data services and a polished delivery pipeline: cloud resources, authentication, containerized services, serverless functions, CI/CD.
- **Decided.** Interesting heroes and character customization are not the focus. Hard display problems, such as layered character animation and swappable gear, are simplified or left out.
- **Decided.** Web only, played in a browser. No desktop wrapper.
- **Decided.** The page is composed of Angular components, and Angular is the focus, because it is part of what is being shown. Buttons, menus, modals and layout are Angular. A canvas renderer such as PixiJS is allowed inside individual components, for example an animated sprite, but it is never the whole display.
- **Decided.** Game balance is not a goal. Content is placeholder.

A useful test for any feature: it should justify a service problem worth explaining. If it does not, it goes.

## 2. The game

- **Decided.** The player runs an adventuring business.
- **Decided.** Heroes are close to unit types: every ranger is the same as every other ranger. Adding a unit type should be simple.
- **Decided (direction, if time allows).** Progression means gaining unit types that get more done with less intervention, automating what the player used to do by hand and freeing them for the next problem.
- **Decided.** A **job** is the template; an **adventure** is one run of a job. The names may change.
- **Decided.** Jobs are more than battles. Examples: take a cart of goods from one settlement to another; go into the forest, chop lumber and return safely; fight through a hundred goblins and kill their king. An adventure progresses linearly, doing things along the way.
- **Working assumption.** A job is an ordered list of stages (travel, fight, gather, arrive). An adventure runs them on one timeline, with health and cargo carried between stages. A cart is a party member with health and no actions. A tree is a resource that a chopping ability "damages" into lumber.
- **Working assumption.** An outcome is richer than win or lose: how far the party got, what it gathered or delivered, who was lost.
- **Open.** Unit types and abilities. A first cut to react to: a fighter who holds the front, a ranger who hits from behind, and a laborer who chops and carries but fights badly, with mana and status effects left out until the loop works.

## 3. The adventure loop

- **Decided.** An adventure runs deterministically in the browser on a timestamped timeline and is submitted in one piece for verification. The game is not offline-first; the aim is to avoid a request per click.
- **Decided.** The player can interject actions that may override a hero's next action. An override waits for the hero's next turn and applies if it is allowed at that moment.
- **Decided.** No real-time gating. Players can pause, and can fast-forward, including through content they have automated.
- **Decided.** One unresolved adventure per player at a time.
  - It must be easy for the player to find, so they know it is in progress and can return to it.
  - If the browser closes, the adventure waits. On next sign-in the app checks for an unresolved adventure and picks it up.
  - If the player never returns, it stays unresolved.
  - If a game update ships before it is resolved, it is discarded.
  - A player who dislikes how a run is going must finish it to continue, or wait for the next update.
- **Working assumption.** The server issues the seed and a frozen snapshot of the party and job at start, so a client cannot choose its seed.
- **Working assumption.** The browser submits only its override log. The verifier regenerates the timeline, so the stored replay is always produced by the server.
- **Working assumption.** There are two kinds of override: forcing a unit's next action, and party orders such as press on or turn back.
- **Working assumption.** Each adventure is pinned to the rules version it was issued under. The verifier only runs the current version, and anything older is discarded. This is how client and verifier are kept from disagreeing about the rules.
- **Working assumption.** The one-adventure rule is a single row per player in Postgres. Starting an adventure either creates it or returns the one already open. Settlement clears it in the same transaction that credits rewards.
- **Working assumption.** Resuming replays the override log so far up to the saved point, using the same replay entry point the verifier needs. The log in progress is kept in the browser. If it is lost, the run restarts from the beginning with the same seed.
- **Open.** What happens to an adventure that was submitted but not yet verified when an update ships: discard it, or drain the queue before a deploy completes.

### What verification proves

The client holds the seed, so a modified client can try override sequences offline and submit the best one. Verification proves that the outcome is reachable under the rules with that seed. It does not prove that a person played it live. Closing that gap would mean the server revealing randomness stage by stage, which is the per-step traffic this design avoids.

## 4. Architecture

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

### Engine provenance

The turn machinery (charge timers, action selection, abilities and tags, the seeded random number generator, events, stepping, overrides) is to be adapted from the author's earlier private project, BattleScript Online. The outer loop of stages, carry-over, cargo and retreat is new, as is replaying an override log, which the earlier project designed and did not build. Files that are copied or adapted will say so.

## 5. Private holdings

- **Decided.** Each player has a per-location asset store: acquired materials, and facilities built or acquired that grant a bonus or access. All of it is private. This is the owner-only data that field-level authorization protects.
- **Working assumption.** Materials move through an append-only ledger keyed on the adventure id. Building a facility debits materials in one transaction, with a constraint against negative balances. Facilities gate which jobs can be started, checked by the hub at start. A cart job moves goods between two locations' holdings.

## 6. Live location channel

- **Decided (direction).** Lambdas do not serve the core requests, but may serve a live channel for a location.
- **Decided.** Canned messages and actions rather than free text, for example one hero waving at another on the same screen.
- **Working assumption.** An API Gateway WebSocket API with Lambda handlers and a DynamoDB table of connections per location. A Lambda authorizer on `$connect` verifies the Cognito token, which travels in the query string or the subprotocol header because browsers cannot set headers on a WebSocket. The same channel carries verification results and a live feed of completed adventures.

## 7. Cooperation

- **Decided (direction).** Players should eventually interact beyond viewing each other's actions. The form is open.
- **Parked suggestion.** A shared project at a location with a fixed requirement and a per-player cap, where everyone benefits on completion.

## 8. Build order

**Working assumption:**

1. Platform: a thin slice deployed through the full pipeline.
2. Core loop: start, play, submit, verify, settle, replay.
3. Location view: heroes here, recent adventures, private holdings and facilities.
4. Live feed and canned actions.
5. Cooperation.
6. Reporting pipeline.

## 9. Considered and not chosen

- **The server runs every adventure.** Simpler, but it gives up fluid play in the browser and the verification problem, which is one of the more interesting parts of the design.
- **Real-time gating, where a job takes ten minutes whether or not anyone watches.** It would give the server a second thing to verify. It was rejected because it imposes a restriction on the player that does not have to be there.
- **The server resolves an abandoned adventure.** Replaced by the one-unresolved-adventure rule, which needs no expiry sweep and no second code path in the verifier.
- **Lambdas serve reads alongside the GraphQL service.** The field-level rules would then exist twice, in two languages.
- **Everything in Postgres.** It would work at this scale. Adventure records are split out because their access patterns differ (by id, and by location and time) and because the split keeps the verifier away from the relational database. The cost is no foreign keys across stores, and rewards that land a moment after the adventure ends.
- **Aurora instead of RDS for read scaling.** Both support read replicas, and the routing and read-your-writes questions are the same on both. Aurora Serverless v2 will not pause while a connection pool holds connections, and resuming takes about 15 seconds.
- **Free-text chat.** A moderation risk on a public site. Canned actions remove the problem.

## 10. Open

- Whether to keep mana and status effects, and whether the party is a marching order instead of a grid.
- Discrete stages (assumed) versus one continuous track with positions.
- Where static content lives so that the TypeScript engine and the Java service agree on it.
- Locations: how many, and what "at a location" means for a player and a hero.
- Rewards, and what settlement credits.
- The AWS account and Terraform state layout.
- The repository layout.
- The names job and adventure.
