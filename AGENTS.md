# HEAT

HEAT (Heroic Enterprise Adventure Time) is a browser game about running an adventuring business, built as a technical showcase. The game is deliberately simple. The interest is in the data services behind it and the pipeline that delivers them.

No application code exists yet. The design is under `docs/design/` and `docs/architecture/`.

## How to work here

Read and follow these two documents in every session:

- How the project owner and an agent work together: @docs/process/collaboration.md
- How a change gets from an idea to `main`: @docs/process/code-changes.md

## Where to find things

| Need | Read |
| --- | --- |
| Why the project exists and what it concentrates on | `docs/design/purpose.md` |
| The game: what the player does | `docs/design/game.md` |
| The system: services, data and flows | `docs/architecture/overview.md` |
| Why a choice was made, and what was rejected | `docs/decisions/` |
| The index of every project document, and how documents are written | `docs/README.md` |

Read the design and architecture documents before any work that touches them. Read `docs/README.md` before adding or changing a document.

## About this file

This is the entry point for any coding agent. It stays short: it says where things are and loads the rules that every session needs. The rules themselves live under `docs/`, where a person can read them too.
