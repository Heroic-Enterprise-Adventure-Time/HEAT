# 0029: The heroes seen at a location

- **Status:** Decided; the item also carries ElectroDB's identifiers per 0041, which say what it is and nothing of whose; a sighting still stores no owner, and 0043 says what happens when a feature needs one; a profile's name is no longer the token's email, per 0043
- **Date:** 2026-10-21
- **Settles:** Issue-100: the location table's first collection, the heroes seen at a location, which the overview's "Open" item and decision 0026 left to be designed before step 3: the key, what counts as being seen, how long a sighting lasts, and how the sample is bounded and read.

## Decision

**The key.** One item per hero in the location's collection of the location table (decision 0023):

| PK | SK | Item |
| --- | --- | --- |
| `LOCATION#<location>` | `SEEN#<heroId>` | a hero seen there: its public fields and when its sighting expires |

The item holds the hero's public fields only: name, unit type, sprite set and level, with `seenAt` and `expiresAt`. **It holds no owner**, not even the player's id: the location table is the public one, and nothing a reader of it is given says whose a hero is. A profile's name is the token's email address today (`packages/hub/src/context.ts`), so a card that named the owner would publish it; a public player name is a decision of its own, not made here. The hero id is the key, so a hero is in a location's collection at most once, and writing its sighting again refreshes it.

**What counts as being seen.** The flows that change a hero write its sighting, in the same transaction as the change:

| Flow | The sighting | Built |
| --- | --- | --- |
| Recruit | put, with a fresh expiry | here |
| Retire | deleted, so a retired hero leaves other players' camps at once | here |
| A mission completed | put again, refreshing the expiry and the level | at settlement, Issue-114 |
| Death | deleted | at settlement, Issue-114 |
| A caravan delivering a hero | deleted at the old location, put at the new | with caravans |

Opening or switching camps is **not** a sighting. A hero is seen when it does something, and looking at a camp is not the hero doing anything; until missions exist, a recruit is the only thing a hero does.

**The TTL is a week.** `expiresAt` is the sighting's time plus seven days, in epoch seconds, the attribute the location table's TTL is set on. Use will be sparse at first, and a shorter time would leave the camp empty most of the time; the number is one constant, `SIGHTING_TTL_SECONDS` in `packages/hub/src/seen.ts`, to be shortened when there are enough players to fill a camp without it. DynamoDB deletes an expired item "typically within a few days" and until then it still appears in a query, so every read filters on `expiresAt` as well; the TTL is what keeps the collection from growing without end, and the filter is what makes it exact.

**The sample.** `heroesSeenAt(location)` returns at most **6** heroes of other players, read with at most **20** items:

1. A Query of `LOCATION#<location>` from a random point among the sightings, `SK BETWEEN SEEN#<random> AND SEEN$`, with `Limit` 20. Hero ids are random UUIDs, so a random start is a random window over the location's heroes.
2. If that window ends before 20, a second Query from the start of the collection, `SEEN#` up to the random point, with `Limit` the rest of the 20. The two together read the collection once round from the random point, never more than 20 items.
3. The filter `expiresAt > now` drops what has expired. It is applied after the limit, so an expired item still counts towards the 20, which is what keeps the bound a bound.
4. The hub removes the player's own heroes, by their ids from the player's own item collection, shuffles what is left, and returns up to 6.

**Public fields on the graph too.** A `SeenHero` has an id, name, unit type, sprite set and level, and nothing else. The query needs a signed-in player, because the player's own heroes are what it leaves out.

**The scene.** The sample walks about the camp beside the player's own heroes; clicking one opens a read-only card with its name, unit type and level.

## Considered and not chosen

**Refreshing a sighting when a camp is opened.** It would keep every visiting player's heroes on show, but opening a camp is not the hero doing anything, and it would put switching camps on the same footing as a mission completed (the owner, in the Issue-100 session). It would also be a write on every camp load.

**A TTL of a day.** The first proposal. With sparse use, most camps would be empty most days.

**The owner's player id on the item, never exposed.** It would let the hub filter a player's own heroes without reading them, but the public table would then hold the link from every hero to its player, readable by any later reader of the table. Reading the player's own heroes costs one Query of a collection the client reads anyway.

**A Scan, or a Query of the whole collection.** Unbounded as players grow; decision 0026 already rejected showing every hero.

**The same first 20 every time.** A Query from the start of the collection always returns the same heroes, the 20 lowest ids; the random start costs nothing more.

**A random attribute and an index on it.** The usual way to sample at scale. The ids are already random, so an index would add a cost and a backfill for no better sample.

**One item per player at a location**, with their heroes inside it. A retire or a death would rewrite the player's item instead of deleting one hero's, and a player's heroes would come in a block rather than mixed into the sample.

**Showing the owner's name on the card.** It is the email address today; see "The key".

## Facts checked

All read on 2026-10-21.

- **TTL** (DynamoDB developer guide, "Using time to live (TTL) in DynamoDB"): the timestamp is a Number "in Unix epoch time format at the seconds granularity"; expired items are deleted "typically within a few days after their expiration", "without consuming write throughput"; until then they appear in reads, and the guide says to "use filter expressions to remove expired items" from Query results.
- **Filters and limits** (the same guide, "Filter expressions for the Query operation"): a filter "is applied after a Query finishes, but before the results are returned", and a Query "consumes the same amount of read capacity, regardless of whether a filter expression is present".

## Where it is described

`docs/architecture/overview.md`, "Camps, heroes and resources". `docs/design/game.md`, "Locations and camps". `packages/hub/src/db/keys.ts`, `packages/hub/src/seen.ts`, `terraform/modules/environment/tables.tf`.
