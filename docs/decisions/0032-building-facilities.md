# 0032: Building facilities: by the level asked for, in one transaction, with the hall's and the warehouse's levels on the camp

- **Status:** Decided; the costs, levels and caps are working assumptions in the engine's static content; the mutation's arguments and its refusals take the shape of 0038 since Issue-155 (one input object, the refusals as result types).
- **Date:** 2026-10-22
- **Settles:** Issue-93: how a player builds and upgrades a camp's own facilities, the costs and levels at first, what a level needs first, and where each facility's level is stored.

## Decision

**One mutation, `buildFacility(location, kind, level)`, names the level being built.** The hub builds it if it is the facility's next level, so a repeated request finds it built and is answered with the camp, charging nothing. No request id is needed. Building is instant (decision 0031).

**One transaction, one `TransactWriteItems` call:**
- the facility's level is set to the next on the condition that it is still the level read;
- each facility the level needs first is checked at its level or above;
- each resource of the cost is debited on the condition that the balance covers it, with a ledger entry `LEDGER#build-<location>-<kind>-<level>#debit#<material>` that can exist once.

A request that loses a race reads the camp again: it answers with the camp if the level is now built, and otherwise is refused with the rule that now fails. The refusals are `BAD_USER_INPUT`, `MAX_LEVEL`, `REQUIRES` with `extensions.missing`, `INSUFFICIENT_RESOURCES` with `extensions.short`, and `CONFLICT`.

**The hall's and the warehouse's levels stay on the camp's item**, `AT#<location>#CAMP`. Every other own facility has an item of its own, `AT#<location>#FACILITY#<kind>`, with its level; no item means level 0. The recruit transaction already checks the hall's level on the camp's item, and settlement the warehouse's, so an upgrade racing either fails one side's condition, and the loser reads again.

**What a level costs and needs is one rule in the engine.** `FACILITIES` lists each facility's levels, with the cost and the facilities each needs. `buildRefusal` says why a camp cannot build the next level, in the order the panel shows the reasons. The hub checks the rule and the panel shows it, as `recruitCost` is shared for recruiting.

**The first numbers:**

| Facility | Level 1 | Level 2 | Level 3 |
| --- | --- | --- | --- |
| Heroes hall | every camp has it; 4 heroes | 80 timber, 20 cloth; 6 heroes | 150 timber, 40 ore, 30 cloth; 8 heroes |
| Warehouse | every camp has it; 100 of each | 80 timber, 40 ore; 200 of each | 160 timber, 120 ore, 20 cloth; 400 of each |
| Mine | 60 timber, 3 cloth (decision 0031) | | |
| Lumber camp | 50 timber, 20 ore | | |
| Caravan hub | 100 timber, 60 ore, 20 cloth; needs the warehouse at level 2 | | |

Every level-1 cost fits in a level-1 warehouse. Higher levels are few on purpose: the owner's direction is that a camp does not build everything at its first location, and later levels will need what other locations have, brought by caravan.

**A level shows its own picture, or the highest below it that has one** (`docs/process/assets.md`, rule 17). `FACILITIES` lists the levels with a picture, and a test checks the list against the files. The hall and the warehouse have pictures for levels 2 and 3 (Issue-93).

## Considered and not chosen

**A request id per build**, as recruiting has. A recruit makes a new item whose id is the request's; a build changes a level that exists once. The level asked for is already what makes a repeat harmless.

**The hall's and the warehouse's levels on facility items of their own**, as the issue first wrote. Every facility would be stored alike, but the recruit and settle transactions would have to check a second item, and the camp's item still holds the counts those transactions change.

**No prerequisites until a facility needs one.** The caravan hub carries stock, so it needs room for it, and one rule in the content costs one condition in the transaction.

**Building over time**, with a timer or a job. Nothing in the game gates on real time (decision 0031).

## Where it is described

`docs/design/game.md`, "The page", "The heroes hall" and "Resources". `docs/architecture/overview.md`, "Camps, heroes and resources". The numbers are in `packages/engine/src/content.ts`; the transaction is `Repository.build` in `packages/hub/src/db/repository.ts`, and the mutation is `packages/hub/src/build.ts`.
