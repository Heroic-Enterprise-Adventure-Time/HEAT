# 0026: Camps, heroes and resources, and the camp ahead of the core loop

- **Status:** Decided
- **Date:** 2026-10-19
- **Settles:** Issue-78: how locations and camps relate, recruitment end to end, the keys of the camp and the hero, and where the camp goes in the build order.

## Decision

**Locations and camps.** Locations are a fixed set, defined in the engine's static content with their shared facilities and the unit types each recruits. A camp is one player's view of one location: their own facilities and levels, their resources, their heroes there. It is the main view; the player switches camps with a select in the page's header bar. Facilities are where the player acts, and the first mission facility is the job board, shared, at every location.

**Heroes.** A hero belongs to one camp. The heroes hall, which every camp has at level 1 or above, caps the active heroes; dead heroes are active, retired ones are not. Recruiting needs a free slot, and when no active hero is alive the next villager is free; every location offers villagers, so no player is ever locked out. A new player starts with one location and no heroes. A hero moves camps only as a caravan passenger, holding a slot at both ends until settlement.

**Resources.** No currency: costs are bundles of resources, held per camp, moved only by caravan, capped per resource by the warehouse's level. A credit past the cap stops at it.

**The keys.** All in the player's item collection (decision 0023), so a camp loads in one Query:

- `AT#<location>#CAMP` holds the hall and warehouse levels and the counts of active and of living heroes. The counts are what the cap and the free-villager rule are conditions on, so each is checked and changed inside the transaction that recruits, retires, kills or moves a hero, and concurrent requests cannot pass a cap. The starting location's camp needs no item until something changes it.
- `AT#<location>#FACILITY#<kind>` and `AT#<location>#HOLDING#<resource>`. The spike's `HOLDING#<material>` items move under their location; the old items in `dev` and `prod` are spike data, are no longer read, and are left in place.
- `HERO#<heroId>`, with the location an attribute: a sort key cannot change, and a hero can move.
- `LEDGER#<causeId>#<entry>`, the cause now an adventure id or a hero id.

**Recruitment.** `recruitHero(unitType, requestId)`: the request id becomes the hero id, so a repeated request is refused by the put's condition and answered with the hero already made. The hub draws the sprite set and the name; the client never chooses them.

**The build order.** Step 2 becomes "Camp and core loop": the camp's art, the camp scene with the heroes hall and the free villager, Issue-15 starting adventures from the job board, then paid recruitment with the roster and retirement, which needs the resources adventures bring in. A party needs heroes, and heroes come from the hall, so the camp is a prerequisite of the loop, not a later view. Step 3 becomes the shared camp.

## Considered and not chosen

**The camp and the location as two screens**, a private camp and a public location view. The overview's step 3 already mixed shared and private data in one view; two screens are two navigations for one place.

**Showing every hero at a location.** Unbounded as players grow. The camp shows a sample, read from short-lived items in the location table, designed before step 3.

**A free starting party and a starting stake**, two villagers and some coin on first sign-in, through an explicit `openCamp` mutation. The free-villager rule gives a new player their first hero from the hall, which is also the tutorial's first step, and the starting camp needs no write at all.

**A board of random candidates** in the hall, refreshed over time. It needs stored offers and a refresh rule, and a refresh on a timer gates on real time (decision 0002). The player picks a unit type; the hub draws the rest.

**The free villager only when no hero is active.** Dead heroes are active, so a camp of dead heroes with no resources stayed locked out after retiring one. The rule is now "no active hero alive".

**A currency**, per player or per camp. One mechanism, the ledger and the conditional debit, serves every resource, and paying in resources is what gives caravans a purpose.

**Moving resources between camps instantly.** Each camp's stock would stop mattering.

**Refusing a settlement that passes the warehouse cap.** It would strand the adventure. The surplus is lost and reported, and the player sees the room left before setting out.

**Not reserving a passenger's slot.** The player can recruit at the destination while the caravan travels, so a delivered hero could arrive at a full camp, and a failed one at a home camp that refilled.

**The location in the hero's sort key**, `AT#<location>#HERO#<id>`. Moving a hero would be a delete and a put under a new key, and every reference to the hero would carry its location.

**The header bar inside the 320×180 scene.** A page element is readable and accessible at any scale; the scene stays the scene.

## Where it is described

`docs/design/game.md`, "Locations and camps", "The heroes hall" and "Resources". `docs/architecture/overview.md`, "Camps, heroes and resources" and "Build order".
