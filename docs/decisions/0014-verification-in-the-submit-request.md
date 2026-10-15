# 0014: Verification and settlement happen in the submit request

- **Status:** Decided
- **Date:** 2026-10-15

## Decision

Submitting an adventure is one GraphQL mutation. The hub replays the override log from the stored snapshot and seed with the engine, writes the server-produced timeline to S3, and runs the settlement transaction, which is conditional on the adventure still being open, so a retried submit cannot pay twice. The response carries the verified result. There is no queue, no verifier function and no settle consumer, and the WebSocket channel carries only the live feed.

This holds because the engine advances on a clock its caller drives. The browser feeds it wall-clock time; the hub feeds it the next event, so an adventure that took ten minutes to play verifies in however long its events take to process, which is milliseconds. No timer inside the engine may wait for real time; that is checked when the turn machinery is ported from BattleScript Online.

## Considered and not chosen

**A queue, a separate verifier Lambda and a settle consumer**, the shape in the overview from 2026-10-08 to 2026-10-15. It existed because the hub was Java and could not run the TypeScript engine; a queue was the only way to hand work across the language boundary and get the result back. With a TypeScript hub it would add a queue, a dead-letter queue, a second function, a push of the result over the WebSocket and the open question of draining the queue before a deploy, and buy nothing.

**Kept as the fallback.** If replay time ever approached the HTTP API's thirty-second limit, the replay moves behind a queue. The engine's replay entry point is the same either way, so nothing is built now to keep that door open.

## Where it is described

`docs/architecture/overview.md`, "Services and data" and "Live location channel".
