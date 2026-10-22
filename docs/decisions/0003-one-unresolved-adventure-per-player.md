# 0003: One unresolved adventure per player

- **Status:** Decided; the discard on a game update amended by 0030: an adventure survives one deploy and is discarded after a second
- **Date:** 2026-10-08

## Decision

One unresolved adventure per player at a time.

- It must be easy for the player to find, so they know it is in progress and can return to it.
- If the browser closes, the adventure waits. On next sign-in the app checks for an unresolved adventure and picks it up.
- If the player never returns, it stays unresolved.
- If a game update ships before it is resolved, it is discarded.
- A player who dislikes how a run is going must finish it to continue, or wait for the next update.

## Considered and not chosen

**The server resolves an abandoned adventure.** Replaced by the one-unresolved-adventure rule, which needs no expiry sweep and no second code path in the verifier.

## Where it is described

`docs/design/game.md`, "The adventure loop".
