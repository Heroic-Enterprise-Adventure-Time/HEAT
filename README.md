# HEAT

[![Build and test](https://github.com/Heroic-Enterprise-Adventure-Time/HEAT/actions/workflows/ci.yml/badge.svg)](https://github.com/Heroic-Enterprise-Adventure-Time/HEAT/actions/workflows/ci.yml) [![CodeQL](https://github.com/Heroic-Enterprise-Adventure-Time/HEAT/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/Heroic-Enterprise-Adventure-Time/HEAT/security/code-scanning)

HEAT (Heroic Enterprise Adventure Time) is a browser game about running an adventuring business. It exists as a technical showcase: the game is deliberately simple, and the interest is in the data services behind it and the pipeline that delivers them.

![The camp at Millbrook on the sandbox stack heat-sb177 at commit c464d1a, 2026-11-02: the heroes hall, the job board, the warehouse, the sites of the lumber camp, the mine and the caravan hub, and the camp's first heroes](docs/images/camp.png)

![A battle on "Timber from the near woods", the replay of player1's adventure on the sandbox stack heat-sb180 at commit aaf8059, 2026-11-02, drawn by the dev server from the same commit: the villager Cora with her axe mid-swing, the wolf taking the hit, and a tree on the road](docs/images/battle.png)

![Six hero still frames at three times their size, composed from the still-south frames of villager-01, fighter-02, knight-06, ranger-01, priest-02 and wizard-01 under art/heroes](docs/images/heroes.png)

## Play it

The game runs at [heat.dcg-games.com](https://heat.dcg-games.com). Sign in with a Google account; a new player gets a camp at Millbrook with one free villager to hire. A first session is hiring that villager, sending it to pick up sticks, then on a timber run, and building the mine with what comes back. Game balance is not a goal and the content is placeholder, on purpose (`docs/design/purpose.md`).

## What is being shown

Each line is a service problem that the game exists to make visible. The system is described in [docs/architecture/overview.md](docs/architecture/overview.md); the rules each part is written to are under [docs/standards/](docs/standards/).

- **An Angular 22 client, zoneless, with PixiJS inside components.** The page is Angular: panels, routing, signals, standalone components. The camp and the battle are a PixiJS scene inside one component, never the whole display. Its GraphQL operations are generated from the committed schema, validated against it by lint, and sent through Apollo Angular, so the schema is the one contract on both sides ([docs/standards/angular.md](docs/standards/angular.md)).
- **A GraphQL hub on one Lambda function.** Apollo Server through its Lambda integration, a Pothos code-first schema with the printed schema committed and checked for staleness, and field-level authorization through scopes ([docs/standards/graphql.md](docs/standards/graphql.md)).
- **DynamoDB and S3, nothing relational, nothing in a VPC.** Two single-table designs, one per partition key: the player table, private and read only through the hub, and the location table, public. Replays are one object each in S3.
- **Cognito for sign-in**, Google through the pool's managed login on the environment's own `auth.` hostname, the authorization code grant with PKCE in the browser, a JWT authorizer on the API.
- **A deterministic engine the server verifies.** The hub issues a seed and a frozen snapshot of the party at start; the browser runs the engine and submits only its override log; the hub replays it from the same seed and settles the result in one transaction. One version per deploy, and the previous deploy stays live beside it to verify the adventures it issued.
- **Terraform applied only by the pipeline.** Every working branch gets a running stack at `<issue>.heat-sb.dcg-games.com` on its first push, destroyed with the branch; a merge to `main` applies `dev`; a merge to `release`, through a pull request that carries the `prod` plan, applies `prod`. The pipeline assumes OIDC roles under a permissions boundary, a resource-type allow-list and a budget action; plans are posted on the pull request ([docs/process/deployment.md](docs/process/deployment.md), [terraform/](terraform/)).
- **Generated art with its provenance.** Every sprite set under [art/](art/) carries the service, the prompts, the ids and the rights beside the frames ([docs/process/assets.md](docs/process/assets.md)).

## How it fits together

Both diagrams draw the system as of commit `1d2a55c` on `main`, 2026-11-02; the third, the pipeline, is with them at the top of [docs/architecture/overview.md](docs/architecture/overview.md).

**The system.** One environment, whether a branch's sandbox stack, `dev` or `prod`: the browser reaches one hostname, sign-in goes through Cognito to Google, every request for data goes through the hub, and the hub is the only identity that reads or writes the tables and the replay bucket.

```mermaid
flowchart LR
  browser["Browser: the Angular client, the PixiJS scene, the engine"]
  google["Google"]
  subgraph env["One environment: a sandbox stack, dev or prod"]
    cognito["Cognito user pool, managed login on the auth. hostname"]
    cf["CloudFront distribution: the environment's one hostname"]
    site[("Site bucket: the client build and config.json")]
    api["HTTP API with a JWT authorizer"]
    live["Hub Lambda, live alias: Apollo Server, Pothos schema, the engine"]
    previous["Hub Lambda, previous alias: the deploy before"]
    role["The hub's execution role"]
    player[("Player table: private, one item collection per player")]
    location[("Location table: public, one collection per location")]
    replays[("Replay bucket: one timeline per adventure")]
  end
  browser -- "code grant with PKCE" --> cognito
  cognito -- "identity provider" --> google
  browser -- "https, bearer token on /graphql" --> cf
  cf -- "the page and its routes" --> site
  cf -- "/graphql and /previous/graphql" --> api
  api -- "/graphql" --> live
  api -- "/previous/graphql" --> previous
  live --> role
  previous --> role
  role --> player
  role --> location
  role --> replays
```

**The adventure loop.** The server issues the seed and a frozen snapshot, the browser plays and submits only its override log, and the deploy that issued the adventure replays it and settles the result in one transaction ([decision 0014](docs/decisions/0014-verification-in-the-submit-request.md), [decision 0030](docs/decisions/0030-the-first-adventure.md)).

```mermaid
sequenceDiagram
  participant B as Browser
  participant H as Hub, live
  participant P as Hub, previous
  participant D as DynamoDB
  participant S as Replay bucket
  B->>H: startAdventure(location, job, heroes)
  H->>D: one transaction: the record with seed, snapshot and version, the open item, and each hero's mark
  H-->>B: seed, frozen snapshot, version
  Note over B: runs the engine on wall-clock time and keeps the override log in localStorage, with no request until the end
  B->>H: submitAdventure(id, overrides)
  alt issued by this deploy
    H->>H: replay(snapshot, seed, overrides) with the engine
    H->>S: the timeline, written once
    H->>D: one transaction: open item deleted, record settled, XP, rewards up to the cap, deaths
    H-->>B: the result
  else issued by the deploy before
    H-->>B: EngineUpdated
    B->>P: submitAdventure(input) at /previous/graphql
    P-->>B: the result, verified by the deploy that issued it
  end
```

## How it is built

The project is built by one person directing coding agents, and the history is meant to be read that way: agents write nearly all of the code and documents, a person reviews and merges.

- Every change is a pull request, reviewed and merged by the owner; nothing reaches `main` or `release` otherwise ([docs/process/code-changes.md](docs/process/code-changes.md)).
- The owner and an agent work under written rules: say when an idea is bad, be candid about what was not done, work conflicts out in conversation, and the owner decides ([docs/process/collaboration.md](docs/process/collaboration.md)). In security and platform management, best practice first, checked against current documentation rather than recalled ([docs/process/best-practices.md](docs/process/best-practices.md)).
- The standards are numbered rules, so that a review finding, an issue and a document cite a rule by number. Lint at the strictest published tiers is the floor; a model reviews each pull request against the standards from a session that did not write it; the whole tree is checked at pauses ([docs/standards/](docs/standards/), [docs/runbooks/](docs/runbooks/)).
- Every significant choice has a decision record with what was considered and not chosen ([docs/decisions/](docs/decisions/README.md)).

## For a reviewer

The tree, by what each part holds:

```text
packages/engine      the deterministic engine: the battle, the adventure's stages, replay, the static content
packages/hub         the GraphQL hub on one Lambda: the schema, start, submit, settle, the data layer
packages/client      the Angular client, with the camp and the battle as a PixiJS scene inside one component
terraform/           the bootstrap roles, the sandbox base, one root per environment, the modules they compose
.github/workflows    Build and test, Sandbox stacks, Deploy, Release
scripts/             the bundle, the publish, the stack test, the sandbox stack's name and state key
art/                 the generated sprite sets, each with its provenance
docs/                design, architecture, decisions, process, standards, runbooks
```

Fifteen minutes, in this order:

1. [packages/hub/src/schema/builder.ts](packages/hub/src/schema/builder.ts), 2 minutes: the two authorization scopes, `authenticated` and `self`, resolved once per request.
2. [packages/hub/src/schema/schema.ts](packages/hub/src/schema/schema.ts), 3 minutes, skimmed: the graph, and where each scope is declared on a type or a field.
3. [packages/engine/src/adventure/replay.ts](packages/engine/src/adventure/replay.ts), 2 minutes: the one entry point the hub verifies with.
4. [packages/engine/test/adventure/determinism.test.ts](packages/engine/test/adventure/determinism.test.ts), 3 minutes: a run stepped by wall-clock time and the replay of its override log produce the same timeline.
5. [docs/decisions/0014-verification-in-the-submit-request.md](docs/decisions/0014-verification-in-the-submit-request.md), 2 minutes: why verification is in the request and not behind a queue.
6. [.github/workflows/deploy.yml](.github/workflows/deploy.yml), 3 minutes: its header comment says the whole plan-and-apply shape, then the two jobs.

Then one merged pull request as a specimen of the process: [PR-179](https://github.com/Heroic-Enterprise-Adventure-Time/HEAT/pull/179), with the review skill's threads, the built-in review's, the commit that answered them, and a finding that became a follow-up issue.

**Run it on a laptop.** Clone, then `npm ci` and `npm test` at the root with Docker Desktop running and no AWS credentials: the hub's tests start DynamoDB Local in a container ([docs/process/development.md](docs/process/development.md), rule 2). Checked from a fresh clone of commit `1d2a55c` on 2026-11-02 with Node 24: every test passed. Running the system itself means pushing a branch, which creates its stack.

## Status

The platform and the core loop, steps 1 and 2 of the build order in [docs/architecture/overview.md](docs/architecture/overview.md), are in production: a player can sign in, hire, run adventures, build and lose heroes. Issues remain open on both. Step 3, the shared camp with other players' heroes and recent adventures at a location, is next. The open issues are the whole backlog.

## Read next

| Want to know | Read |
| --- | --- |
| Every project document, and how documents are written | [docs/README.md](docs/README.md) |
| What the player does | [docs/design/game.md](docs/design/game.md) |
| The system: services, data, flows, build order | [docs/architecture/overview.md](docs/architecture/overview.md) |
| Why a choice was made, and what was rejected | [docs/decisions/](docs/decisions/README.md) |
| How a change is run and seen before review | [docs/process/development.md](docs/process/development.md) |
| Each stack: what it manages and whether it is applied | the README in each directory under [terraform/](terraform/) |
| How an agent starts a session here | [AGENTS.md](AGENTS.md) |

## Rights

All rights reserved. The repository is published to be read.
