# HEAT

HEAT (Heroic Enterprise Adventure Time) is a browser game about running an adventuring business, built as a technical showcase. The game is deliberately simple. The interest is in the data services behind it and the pipeline that delivers them.

The design is under `docs/design/` and `docs/architecture/`. Application code is under `packages/`, one npm workspace per package, with its standards in `docs/standards/typescript.md`; what exists today is the spike described in `docs/architecture/overview.md`, not the game. Generated art is under `art/`, each set with its provenance. Infrastructure is under `terraform/`, one stack per directory, each with a README that says what it manages and whether it is applied. `local/` runs the system on a laptop.

## How to work here

Read and follow these documents in every session:

- How the project owner and an agent work together: @docs/process/collaboration.md
- How a change gets from an idea to `main`: @docs/process/code-changes.md
- How decisions are made, especially about security and platform management: @docs/process/best-practices.md

## Starting on an issue

A session is one issue. Asked to work on issue N, in whatever words, read these in order before saying anything about the work:

1. The issue, `gh issue view N`, and the open list, `gh issue list`. The issue body is the agreed shape of the checkpoint.
2. `docs/private/heat-working-context.md`, if it exists. Git ignores it. It holds the AWS account ids, the standing rules summarized for a session without the repository, and the state of the work at the end of the last session, which the agent keeps current. Nothing in it is copied into a committed file.
3. The sections of `docs/architecture/overview.md` and the records in `docs/decisions/` that the issue names.
4. The README of each stack under `terraform/` and the `AGENTS.md` of each area under `packages/` that the issue touches.

Then follow the cycle in `docs/process/code-changes.md` from rule 20: agree the shape in conversation, confirm the checkout is clean on `main`, branch, and go.

## Where to find things

| Need | Read |
| --- | --- |
| Why the project exists and what it concentrates on | `docs/design/purpose.md` |
| The game: what the player does | `docs/design/game.md` |
| The system: services, data and flows | `docs/architecture/overview.md` |
| Why a choice was made, and what was rejected | `docs/decisions/` |
| The Terraform state bucket, who applies, and the one-time bootstrap | `terraform/backend/README.md` |
| Running and seeing a change: the sandbox stacks and the fast loop | `docs/process/development.md` |
| Making art or audio: the services, the connectors, the hero sprite set, a camp's ground and facilities | `docs/process/assets.md` |
| Making a hero sprite set, step by step | `docs/runbooks/hero-sprite-set.md` |
| The index of every project document, and how documents are written | `docs/README.md` |

Read the design and architecture documents before any work that touches them. Read `docs/README.md` before adding or changing a document.

## About this file

This is the entry point for any coding agent. It stays short: it says where things are and loads the rules that every session needs. The rules themselves live under `docs/`, where a person can read them too.
