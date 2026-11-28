# 0064: A job's last party is kept in the browser

- **Status:** Decided; built by Issue-440.
- **Date:** 2026-11-28
- **Settles:** Issue-440: where the party a job's page opens with is kept. The owner's call of 2026-11-28.

## Decision

**A job's page opens with the last party sent on that job from that camp, and the browser keeps it.** When a Depart succeeds, the page writes the party's hero ids to the browser's local storage under `heat.party.<location>.<job>`; a party the hub refused is not written. When the job's page opens, it reads that entry once and picks those heroes. A caravan is a job, and its party is kept the same way; its cargo and who stays are not kept, because a hero who stayed is no longer at the camp and a cargo is chosen against the balance of the day.

**What is kept is a suggestion, and the page checks it like any other pick.** A hero of the kept party who is not alive at the camp now, dead, retired, moved by a caravan or never this player's, is not picked, and nobody takes its place. The storage is the player's to edit, so what comes back is checked against a schema, a list of ids no longer than a full party, and ignored whole otherwise. The hub checks the party a Depart sends as it always did (`docs/standards/graphql.md`, rule 9), so nothing rests on the stored value.

**The key holds no player.** A hero's id is the player's own, so a party kept by another player who used the same browser picks nobody.

**What this gives up.** The kept party does not follow the player to another browser or device, and it goes when the browser's data is cleared. The owner accepted both: the party is a convenience, and a player who finds nobody picked picks as before.

## Considered and not chosen

- **The hub's replays of the job.** They hold each adventure's party and need no new storage. But a job's replays are every player's, and no field says whose an adventure was (decision 0043), so the newest replay of a job is as likely another player's party as the caller's.
- **A field on the player, written by the start.** It would follow the player to every device. It needs a new attribute or item in the player table and a design of its key (`docs/architecture/camps.md`), a write in the start's transaction, a field under `self` in the schema and its tests, for a default the player can set again with four clicks. It can replace this later without changing what the page does.
- **Keeping the cargo and who stays as well.** A hero who stayed has moved, so that pick could never be restored, and a kept cargo would be clamped to a different balance and a different room each time.

## Where it is described

`docs/design/game.md`, "The page"; `packages/client/src/app/camp/panels/last-party.ts` and `job-panel.ts`.
