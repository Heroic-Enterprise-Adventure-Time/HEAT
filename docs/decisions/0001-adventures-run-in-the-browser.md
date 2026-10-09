# 0001: Adventures run in the browser and are verified by the server

- **Status:** Decided
- **Date:** 2026-10-08

## Decision

An adventure runs deterministically in the browser on a timestamped timeline and is submitted in one piece for verification. The game is not offline-first; the aim is to avoid a request per click.

## Considered and not chosen

**The server runs every adventure.** Simpler, but it gives up fluid play in the browser and the verification problem, which is one of the more interesting parts of the design.

## Where it is described

`docs/design/game.md`, "The adventure loop".
