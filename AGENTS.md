# HEAT

HEAT (Heroic Enterprise Adventure Time) is a browser game about running an adventuring business, built as a technical showcase. The game is deliberately simple. The interest is in the data services behind it and the pipeline that delivers them.

The design is under `docs/design/` and `docs/architecture/`. Application code is under `packages/`, one npm workspace per package, with its standards under `docs/standards/` (`typescript.md` for every package, `angular.md` for the client, `graphql.md` for the hub), each loaded by its area's `AGENTS.md`; what exists today is what `docs/architecture/overview.md` marks built. Generated art is under `art/`, each set with its provenance. Infrastructure is under `terraform/`, one stack per directory, each with a README that says what it manages and whether it is applied, with its standards in `docs/standards/terraform.md`, loaded by that area's `AGENTS.md`. Nothing runs the system on a laptop: a branch's sandbox stack is the system, and the laptop runs the fast loop (`docs/process/development.md`).

## How to work here

Read and follow these documents in every session:

- How the project owner and an agent work together: @docs/process/collaboration.md
- How a change gets from an idea to `main`: @docs/process/code-changes.md
- How decisions are made, especially about security and platform management: @docs/process/best-practices.md
- What a session has to know about its shells, its tools and the desktop app: @docs/process/sessions.md

## Starting on an issue

A session is one issue. Asked to work on issue N, in whatever words, read these in order before saying anything about the work:

1. The issue, `gh issue view N`, and the open list, `gh issue list`. The issue body is the agreed shape of the checkpoint.
2. `docs/private/heat-working-context.md`, if it exists. Git ignores it. It holds what cannot be committed: the AWS account ids, how the agent reaches AWS, and the owner's own context. Nothing in it is copied into a committed file. It holds no state of the work: the issue, its comments, the open list and the log are the state.
3. The sections of `docs/architecture/overview.md` and the records in `docs/decisions/` that the issue names, by section and not whole (`docs/process/sessions.md`, rule 18).
4. The README of each stack under `terraform/` and the `AGENTS.md` of each area under `packages/` that the issue touches.

Then follow the cycle in `docs/process/code-changes.md` from rule 20: agree the shape in conversation, confirm the checkout is clean on `main`, branch, and go.

## Where to find things

| Need | Read |
| --- | --- |
| Why the project exists and what it concentrates on | `docs/design/purpose.md` |
| The game: what the player does | `docs/design/game.md` |
| The battle: how an adventure plays out | `docs/design/battle.md` |
| The system: services, data and flows | `docs/architecture/overview.md` |
| How an adventure is started, played, verified and replayed | `docs/architecture/adventure-loop.md` |
| The tables' keys and the transactions that write them | `docs/architecture/camps.md` |
| Why a choice was made, and what was rejected | `docs/decisions/` |
| The Terraform state bucket, who applies, and the one-time bootstrap | `terraform/backend/README.md` |
| Running and seeing a change: the sandbox stacks and the fast loop | `docs/process/development.md` |
| Running the dev server from an issue's worktree, step by step | `docs/runbooks/dev-server.md` |
| Taking an image of the scene or of a battle out of the session's browser | `docs/runbooks/capture-scene.md` |
| Making art or audio | `docs/process/assets.md` |
| Making a hero or monster sprite set, step by step | `docs/runbooks/hero-sprite-set.md` |
| Making a resource's icon, or a facility's, step by step | `docs/runbooks/resource-icon.md` |
| The index of every project document, and how documents are written | `docs/README.md` |

Read the design and architecture documents before any work that touches them, by the section it touches (`docs/process/sessions.md`, rule 18). Read `docs/README.md` before adding or changing a document.

## About this file

This is the entry point for any coding agent. It stays short: it says where things are and loads the rules that every session needs. The rules themselves live under `docs/`, where a person can read them too.
