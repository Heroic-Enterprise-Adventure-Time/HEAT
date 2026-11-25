# 0059: More locations: general unlocks, caravans with a cart, and Highcrag

- **Status:** Decided; the numbers are working assumptions. Built by Issue-350: the art, Highcrag's ground and layout and the caravan's cart, with the owner's calls of 2026-11-24 on what the record leaves open, the earth of Highcrag's camp, the cart's travel and its wreck, now in `docs/design/game.md`, "Locations and camps" and "Caravans". Built by Issue-351: unlocks and Highcrag in the engine and the hub, which amended it on 2026-11-24, the owner's calls, in the amendment below: the page works out which unlocks were new from the player's own, which the Decision leaves to that issue; and where the Decision says "Settlement writes each unlock of the result that the player does not hold" and "each unlock the run earned that the player does not hold adds one item", settlement writes one item for each unlock the result lists, each attribute only where it is absent, so one the player holds is not changed. Built by Issue-352: the job that opens the road and the client's second camp, with the owner's calls of 2026-11-24 on the road's numbers and the page's words, in its amendment below. Not built: the cart in the engine, Issue-353; the hub's caravan, Issue-354; the caravan hub's panel, Issue-355; Highcrag's own content, Issue-356; Millbrook's second levels, Issue-357.
- **Date:** 2026-11-23
- **Settles:** Issue-292: the second location, how a location unlocks, caravans with their cargo and their passengers, what a caravan risks, the caravan hub's jobs, and the keys all of it needs, which the overview's "Open" and decision 0013 left to be designed before they are built. The owner's calls of 2026-11-23, made in the Issue-292 session.
- **Amends:** 0026, "every location offers villagers, so no player is ever locked out": Highcrag offers none, and the guarantee is the starting location's; and 0026, "Recruitment", `recruitHero(unitType, requestId)`, which names no location: recruiting takes its location from Issue-351 on. 0032, "The first numbers", which give the mine, the lumber camp and the caravan hub one level each: each gains a second at Millbrook, costing stone (Issue-357). 0058, "a job's own penalty returns with caravans": no job states a penalty, and what a caravan loses is its cargo, by the one table below.

## Decision

**An unlock is general.** An unlock is something a player earns once and holds for good: one-time, scoped to the player's account, and permanent. It is not only for camps. A mission is one way to earn one, a new camp is one thing it opens, and there will be other ways and other things, such as an unlock earned by defeating a kind of enemy with a hero that carries a trait (the owner, 2026-11-23). So the mechanism is built once, for any unlock, and a location is its first use.

**The content has one list of unlocks,** closed, in the engine, each with its name and the words said when it is earned. What needs an unlock names it: a location first, and later a job, a recruit or a facility's level by the same field. What grants an unlock names it: a job, on arrival, first.

**The engine says what a run earned.** An adventure's result lists the unlocks the run earned, which for now are its job's, on arrival. A grant by what happens in a fight is then a change to the engine alone: it is replayed and verified like the rest of a result (decision 0014), and the hub writes whatever the list holds.

**The key is one item per unlock in the player's own collection** of the player table (decision 0023):

| PK | SK | Item |
| --- | --- | --- |
| `PLAYER#<id>` | `UNLOCK#<unlock>` | an unlock the player holds: the unlock, when it was earned, and the adventure that earned it |

Settlement writes each unlock of the result that the player does not hold, in its one transaction, so that a second grant changes nothing and fails nothing. A player has one open adventure (decision 0003), so the only settlement that can race another is a repeat of the same submit, which the record's own condition already answers. The item is never deleted, has no TTL, and nothing revokes it. It is the player's private data, served to its owner alone.

**An unlock is told when it is earned, and what was new is told to its owner alone.** A settled result is served to any signed-in player, so it lists the unlocks the run earned whether or not the player held them: that says what the run did, as what dropped does, and nothing of what the player held before. Which of them were new to the player is said to the owner alone, by the page from the player's own unlocks or by the submit's answer; Issue-351 picks which, and no public field says it. Whether a job says beforehand what it grants is its description's choice, as it is for a drop (decision 0058): the job that opens Highcrag says so, and a later unlock may be a secret.

**A location may need an unlock, and the starting location needs none.** A camp at a location whose unlock the player holds is level 1 with no heroes until something changes it, with no item of its own, as the starting location's camp is (decision 0026). The player's camps are the starting location's and one for every location whose unlock they hold. Every verb that takes a location refuses one the player has not unlocked, by its read and by a condition on the unlock's item in its transaction: recruit, build, start, and a caravan's destination. Recruiting takes its location from here on, where it recruits at the starting location alone today.

**The first unlock is the road to Highcrag, and a job of the caravan hub grants it.** "Scout the road to Highcrag" is a plain job with no cart: travel, bandits on the road, arrive, and the party comes home. The caravan hub is then the one door to the rest of the world, and a camp that is opened can be reached: warehouse level 2, the hub, the road, then caravans. That holds once all of it is built, and not in between ("The build order" below). The job stays listed afterwards as a job like any other.

**The second location is Highcrag, a hill fort above a quarry, supplied from Millbrook and not a second start.**

| | Highcrag |
| --- | --- |
| Every camp has | the heroes hall and the warehouse, and the shared job board |
| A camp may build | a quarry and a caravan hub |
| Recruits | the miner, the fighter, and the knight, found only there |
| Does not recruit | the villager, the lumberjack, the ranger |
| Its resources | ore, from a job on its board that a lone miner completes; stone, from the quarry |
| Has none of | timber: there are no trees, so what its buildings and its miner cost in timber comes by caravan |

**Highcrag recruits no villager** (the owner, 2026-11-23), so there is no free villager there. A camp at Highcrag begins empty, and its first hero comes by caravan: a hero who stays, or a cargo that pays for a recruit. The free-villager rule is unchanged wherever a villager is recruited, and it still keeps a player from being locked out of the game, because Millbrook is every player's and offers it. What it no longer promises is that every camp can restart itself: a camp at Highcrag whose heroes are all dead waits for a caravan.

**Stone is gathered by mining at level 2, with no new trait.** A stone outcrop's drop has no chance in its first row, which decision 0058's rows by level allow for and nothing has used. A villager's mining 1 brings home none, and is not told why. **Hide gets its first cost:** the knight costs ore and hide, and hide comes from wolves and a skinner, and Highcrag recruits no skinner. **Millbrook wants stone** for a second level of the mine, the lumber camp and the caravan hub; the costs that exist do not change.

**A caravan is a job that delivers.** A route is a job the caravan hub posts, "Caravan to Highcrag", which names the location it delivers to and is run by a party of one to four like any job. A caravan has no pay: the delivery is the reward.

**The cart** is a party member with health and no actions, as `docs/design/game.md`, "The battle", already had it for caravans. It stands on the near line, is hit like any party member, and a guard covers it like any ally. It is not a hero: it earns no XP, carries no trait and is not counted among the heroes standing when a drop is read, and a party whose heroes are all down is down whether or not the cart stands. Something on the road aims at it: the bandit goes for the cart first when the cart is in its reach, and otherwise acts as it did. The engine knows nothing of what the cart carries; its result says whether the cart was standing on arrival.

**The cargo is chosen at the start from the origin's warehouse,** up to what the cart carries, which the hub's level sets: 100 in all at level 1. It is debited in the start's transaction and held on the adventure's record until the adventure ends. The page shows the destination's room for each resource of the cargo, where a job's page shows none for a drop, because the cargo is the player's own choice and names nothing hidden.

**Passengers fight.** Every hero on a caravan is in its party and acts by its unit type's list. The player marks which of them stay at the destination; the rest are the escort and come home. A slot at the destination's hall is taken at the start for each hero who stays, and its slot at home is kept until the adventure ends, so the slot is held at both ends (decision 0026).

**What the end of the run does:**

| The run ends | Cargo | Heroes marked to stay | Drops and the enemies' XP | Bonus |
| --- | --- | --- | --- | --- |
| Arrives, cart standing | credited at the destination up to its warehouse's cap, the rest lost, and the result says how much | land there, a dead one too, and count there | kept | paid |
| Arrives, cart broken | lost | land there | kept | paid |
| Retreat, ordered or by a time limit | abandoned | stay home | kept | lost |
| All down | lost | dead, at home | none | none |
| Discarded after two updates | returned to the origin, up to its cap | stay home | none | none |

The one retreat rule of decision 0058 stands for a caravan, and the cargo is all or nothing. A broken cart does not end the run, because the passengers still have somewhere to go. A discard returns the cargo because an update is the game's doing and not the player's.

**Everything but the cargo and the heroes who stay goes to the origin camp,** as every job's does: the drops, the enemies' XP and the bonus. The adventure is the origin's: its record names the origin as its location, and its line in "Recently here" is the origin's.

**Who may read a caravan.** Once settled, its result says what was delivered and what was lost, and is public as every result is, with no owner. The cargo of a caravan still in flight is on an open adventure's record, which is served to its owner alone.

**One direction per hub.** Millbrook's hub sends to Highcrag; coming back needs Highcrag's own hub and its job, "Caravan to Millbrook". A hero who stays before that hub is built stays until it is, and the page says so before the caravan departs.

**The caravan needs no new table, index or partition key.** Decision 0026 keyed a hero by its id with its location an attribute, and a holding and a camp by their location, for this.

| Need | Key |
| --- | --- |
| A caravan in flight | one attribute on the adventure's record, `caravan`: the destination, the cargo and the heroes who stay |
| Cargo loaded | `LEDGER#<adventureId>#load#<material>`, with the debit of the origin's holding, in the start's transaction |
| Cargo delivered | `LEDGER#<adventureId>#deliver#<material>`, with the credit to the destination's holding and what its cap lost, at settlement |
| Cargo returned | `LEDGER#<adventureId>#return#<material>`, with the credit to the origin's holding, in a discard |
| A slot held | the destination camp's count of active heroes, raised in the start's transaction on the condition that the hall's cap there covers it, and lowered again at an end that delivers nobody |
| A hero lands | its `location` attribute set to the destination; the origin's counts lowered and the destination's count of living heroes raised if it lives; its sighting deleted under the origin, and put under the destination only if it lives, a dead hero having none (decision 0029), all in the settle transaction |

One open adventure per player means one caravan in flight, so a held slot is always the open adventure's: the page reads it from there, and the camp's item needs no count of its own for it. A resource that is both dropped and delivered in one settlement is two holdings, the origin's and the destination's, and two ledger entries, `credit` and `deliver`, so no two writes of the transaction name one item.

**The largest settlement fits one transaction.** The open item, the record, the two camps, four heroes, two sightings for each hero who lands alive and one for each other, and the feed item are at most 17 items; each resource credited or delivered adds a holding and a ledger entry, and each unlock the run earned that the player does not hold adds one item. Against DynamoDB's 100 that is room for about forty resources in one adventure, as decision 0058 found for a job with no caravan.

**Energy is not decided here.** Issue-337 is the owner's to think over, and nothing here is built toward it. This shape leaves it room without reserving anything: a caravan is a job like any other, so a cost per job is a field on a job, the start already writes each hero of the party, and a hero who stays is already rewritten when it lands. A comment on Issue-337 says so.

**The numbers** are working assumptions that their build issues check over seeds. The owner has seen one: the cart carries 100 in all at hub level 1. Not seen: the cart's 60 health; the road's two bandits; a caravan's road of two fights, bandits in each, with a wolf by chance; at Highcrag a miner for 30 ore and 20 timber and a fighter for 40 ore, as at Millbrook; an outcrop's 40 health, 3 XP and 20 to 24 stone at mining 2; a level-2 hub's cart of 200. The knight's numbers and cost, the quarry's cost and jobs, and what each of Millbrook's second levels costs and gives are agreed at the start of Issue-356 and Issue-357.

**The build order,** inside step 3: the art of Highcrag's camp and the cart (Issue-350); unlocks and Highcrag in the engine and the hub (Issue-351); the client's second camp and the job that opens the road (Issue-352); the cart in the engine (Issue-353); the hub's caravan (Issue-354); the caravan hub's panel (Issue-355); Highcrag's own content, with its art (Issue-356); Millbrook's second levels (Issue-357). The owner's call is all of them in step 3, ahead of step 4. The agent put seven to the owner; the second location became two, its hub and its client, when unlocks became general. In this order the road can be scouted from Issue-352 and the first caravan runs with Issue-355, so between them a player on `dev` can open Highcrag and find a camp that nothing reaches yet. That gap is accepted (the owner, 2026-11-24, the review of PR-358): the empty hall there says that a hero comes by caravan, and no release to `prod` is made between Issue-352 and Issue-355.

## Amendment: what the engine and the hub built, and the calls left to them (Issue-351, 2026-11-24)

The owner's calls at the start of Issue-351, which built unlocks and Highcrag in the engine and the hub. The agent put seven to the owner, each with one recommendation, and the owner took all seven as recommended.

**Highcrag's costs and its job.** A miner for 30 ore and 20 timber and a fighter for 40 ore, as at Millbrook: one price for a unit type until Issue-356 gives Highcrag a reason to differ, and the timber in a miner's price is what makes the caravan matter there. The board's job is "Ore from the crag": travel, two ore veins, then one wolf, arrive, with no pay and a bonus of 4, the mine's first job on another hill. Nothing can be built at Highcrag until Issue-356 but the levels of the hall and the warehouse every camp has.

**The numbers,** over 500 seeds, `seed-0` to `seed-499`, with nothing forced, for the parties Highcrag can field. The engine's test holds every column but the least health and the longest stages, which a probe of the same runs measured on `main` at d173f7f before the job was written.

| Party | Complete | Deaths | Ore | Least health left | Longest gather / fight |
| --- | --- | --- | --- | --- | --- |
| 1 miner | 500 | 0 | 56 to 64 | 3 of 30 | 31.0 s / 9.3 s |
| 1 fighter | 500 | 0 | none | 35 of 50 | 18.2 s / 5.2 s |
| 2 miners | 500 | 0 | 56 to 64 | 18 | 17.0 s / 4.6 s |
| miner, fighter | 500 | 0 | 56 to 64 | 21 | 13.0 s / 4.7 s |
| 2 fighters | 500 | 0 | none | 44 | 10.3 s / 2.6 s |
| 4 miners | 500 | 0 | 56 to 64 | 21 | 9.3 s / 3.0 s |

Every hero earns 15 XP, and the limits are 90 s and 60 s. One run by a lone miner pays for a fighter at its worst roll, or for the ore of a second miner, whose timber comes by caravan. A lone miner's worst seed leaves it 3 health, and nobody died on any seed, which matters where a camp whose heroes are all dead waits for a caravan. Forced actions were not played against this job.

**Which unlocks were new is worked out by the page, from the player's own unlocks.** The Decision leaves it between the page and the submit's answer. An unlock's item stores the adventure that first earned it, and `me.unlocks` serves that to its owner alone, so an unlock in a result was new exactly when the player's names that adventure. That holds across a repeat after a lost response and a reload, puts no private fact beside the public result, and needs no read of the unlocks at settlement and no second shape for a mutation's success.

**The write at settlement is one update for each unlock the result lists, held or not,** every attribute set only where it is absent, with no condition and no read. Where the Decision says "Settlement writes each unlock of the result that the player does not hold" and "each unlock the run earned that the player does not hold adds one item", the transaction carries one item for each unlock the result lists; what it leaves is the same, since an item the player holds is not changed. The fact the Decision left to this issue, checked against DynamoDB Local with ElectroDB 3.9.3 on 2026-11-24 and held by `packages/hub/test/electrodb.test.ts`: an entity's `update` whose `data` callback sets each attribute with `ifNotExists`, committed inside `transaction.write`, is an `Update` with no `ConditionExpression` and `if_not_exists` in its `UpdateExpression`; it makes the item when there is none, with the key's attributes and ElectroDB's identifiers; and on an item that exists it changes nothing and the rest of the transaction commits. Recruit and build already make a camp's item with an update inside a transaction, each under a condition of its own.

**A locked location is `BAD_USER_INPUT`.** A verb that takes a location refuses one the player has not unlocked by its read and by a condition check on the unlock's item in its transaction, as the Decision has it, and answers as building already answered "no such camp": the player's own camps never list a locked location and an unlock is never taken away, so a request that names one is the client's defect and not a rule of the game the page has to explain. The check and its read are made only where the location needs an unlock, so what the three verbs read and write at Millbrook is what it was; a test holds that for each of them. `me.camps` costs a second Query, of the `UNLOCK#` items.

**`recruitHero` requires its location.** The page's one recruit sends the camp on screen. A tab loaded before the deploy sends none: the hub refuses it before any resolver runs, the refusal carries the `outdated` flag, and the tab reloads. A tab with an adventure open, or a result showing, holds its reload until the adventure is over (decision 0030), so for those minutes it cannot recruit; the owner accepted that window on the review of PR-359, where an optional location for one deploy would have closed it. A request id reused for another location is `BAD_USER_INPUT`, as one reused for another unit type is; the location is compared with where the hero is, which is where it was recruited until a caravan moves a hero, and Issue-354 has to say what a repeat finds then.

**A location's public reads stay open.** `heroesSeenAt` and `recentAdventuresAt` answer any signed-in player for Highcrag, unlocked or not: the location table is public (decisions 0029 and 0043), and a recruit there puts a sighting as it does at Millbrook.

**What Issue-351 chose where this record is silent.** The first unlock is `road-to-highcrag`, "The road to Highcrag", and its words when earned are "The road to Highcrag is open. You have a camp there now.", a working assumption for Issue-352 to show. A result settled before the deploy has no list of unlocks and is read as having earned none, and a deploy leaves out an unlock its content does not know, in a result and among a player's own, since the deploy after it reads the same tables. No job grants an unlock until Issue-352, so `submitAdventure` takes the content its replay reads as a last parameter that only a test passes, as `startAdventure` takes the seed's source, and the hub's tests settle a job they add to it.

Not chosen in this issue: **the submit's answer saying which unlocks were new,** which has to be stored or worked out again for a repeat, since a repeat answers the record as it is, and puts a second shape on a mutation's success; **a create of the unlock's item on the condition that it is absent,** which cancels the settlement of every later run that earns it; **a read of the unlocks at settlement, writing only those not held,** a read and a race for what the update does without either; **a refusal type for a locked location,** a member of three result unions that no honest page can be answered with; **an optional location that defaults to Millbrook,** a second meaning for one mutation; and **closing a locked location's feeds,** which would make a public table's read depend on the caller's private data.

## Amendment: the road's job and the page's second camp (Issue-352, 2026-11-24)

The owner's calls at the start of Issue-352, which built the job that grants the first unlock and the client's side of a second camp. The agent put six to the owner, each with one recommendation, and the owner took all six as recommended.

**The road's fight is two bandits, with no pay and a bonus of 8,** which brings the job's XP to the wolves job's 20, under a limit of 60 s. The numbers, over 500 seeds, `seed-0` to `seed-499`, with nothing forced. The engine's test holds the outcome of every row but the two marked, and the deaths within a band: nobody lost where the table says 0, a fighter with a villager losing one on more than 20% and fewer than 34% of seeds, a fighter with a ranger on some and fewer than 20%, four villagers on more than 70%. The counts themselves, the two marked rows and the longest fight, 13.9 s, were measured by a probe of the same runs on `main` at 007b55f before the job was written.

| Party | Complete | Defeated | Completed runs with a death |
| --- | --- | --- | --- |
| Any lone hero of a type Millbrook recruits | 0 | 500 | |
| 2 villagers; ranger and villager | 0 | 500 | |
| 2 rangers (probe) | 78 | 422 | 74 |
| 3 villagers (probe) | 487 | 13 | 487, with 780 villagers lost |
| 4 villagers | 500 | 0 | 402, one villager each |
| Fighter and villager | 500 | 0 | 134: the villager 117, the fighter 17 |
| Fighter and ranger | 500 | 0 | 65, the fighter |
| 2 fighters | 500 | 0 | 0 |
| Fighter, ranger, villager | 500 | 0 | 0 |
| Fighter and 3 villagers | 500 | 0 | 0 |

The party that is safe on the wolves job, a fighter with a villager, always opens the road and loses a hero on about one run in four, so the job asks for one more hero than a player has needed. A death is permanent and nothing brings a hero back yet (game.md, "Heroes"), which is the cost of the choice; the description warns of it. One bandit, with a bonus of 14, is easier than the wolves job: a lone fighter and two villagers complete it on every seed with no death. Three, with a bonus of 2, defeat a fighter with a villager, a fighter with a ranger and three villagers on every seed, and only two fighters with a ranger are safe.

**The words,** each a working assumption to be changed by looking. The job's description: "Nobody has walked the hill road to Highcrag since bandits took it. Clear it as far as the fort's gate and the way is open: you will have a camp there. One sword is not enough." The unlock's words stay Issue-351's. An empty hall at Highcrag: "No hero is here yet. Nobody at Highcrag joins for nothing: its first hero comes by caravan from another camp.", and where its heroes are dead or retired, that the next comes by caravan. Where the player cannot be read again after a run is sent, the result says that what the run opened is not shown yet and offers the read again, since the news is told once and from that read alone (the review of PR-361).

**A new unlock is told on the result of the run that earned it,** under how it ended, and not on a replay's page: a replay is public, and which unlocks were new is the owner's alone to be told. The page reads them from the player's own unlocks alone, those that name the adventure just settled, where Issue-351's amendment has "an unlock in a result was new exactly when the player's names that adventure": the two say the same, since settlement writes the name only for an unlock the result lists, and the page then asks nothing new of the submit, which also goes to the previous deploy (`docs/standards/angular.md`, rule 19).

**Highcrag's layout lists the hall, the warehouse and the job board.** The content gives a camp there nothing to build until Issue-356, and the engine has no quarry among its facilities. The sites the owner chose in the mock-up for the caravan hub and the quarry are in a comment beside the layout and on Issue-356, and the earth under the hub's site stands bare until then.

**A battle is drawn on the ground of the location its adventure left from** (decision 0028, its amendment of the same date): found while reading for this issue, and done in it by `docs/process/code-changes.md`, rule 30.

**The stack test's three checks of Issue-351 stand as they were,** where the agent first put to the owner that they would branch on whether the user holds the unlock. The pipeline's test user builds the mine and nothing else, on a sandbox stack and on `dev`, so it never has a caravan hub and never scouts the road, and a branch for a user that holds the unlock would be code no run reaches. What is behind the unlock is proven against DynamoDB Local, and on the issue's stack by hand, as a base test user whose camp was played up to the hub.

**`submitAdventure`'s content parameter stays,** where Issue-351's hand-over had it that it "can go" once a job of the content grants: `docs/standards/graphql.md`, rule 27, accepted since, holds it as the way a test settles a job the game does not have, and the tests of the rule still use it, beside the new tests that settle the content's own job through the verbs.

Not chosen in this issue: **a link from the result to the camp it opens,** since an unlock is general and the next one may open no camp, and the select is where a camp is chosen; **the unlock's words on a replay's page,** above; **the hub's and the quarry's spots in the layout before their facilities exist,** which would draw and list a caravan hub the content does not give Highcrag; and **the stack test playing its user up to the hub,** some twenty adventures on every run for one check.

## Considered and not chosen

**The villager at Highcrag, with its free villager and a board job it cannot fail,** the agent's first shape, which kept decision 0026's "every location offers villagers". The owner's call is the miner in its place: Highcrag is supplied from Millbrook, and a camp that restarts itself from nothing is a second start.

**The camp's item as the unlock,** the agent's first shape: a location is unlocked when its `AT#<location>#CAMP` item exists. It serves a camp and nothing else, and the owner's call is that an unlock is general.

**A list of unlocked locations on the player's profile.** One attribute to read, and a second shape the day something other than a location is unlocked; an item per unlock is conditioned on by a transaction with no read of a list.

**The hub deciding what a run earned,** by reading the job's grants at settlement. It is enough for a job's arrival, and a grant earned in a fight would then have the hub reading the timeline for what the engine already knows.

**The scouting job on the job board.** A player could then open a camp that nothing can reach or supply.

**The first caravan opening its own destination.** The start would hold a slot and promise a delivery at a camp the player does not yet have.

**Opening a location for a price in resources.** A purchase, where a job is play.

**A new gathering trait for stone, and a quarryman to carry it.** A new unit type and its art for the puzzle that a row with no chance already makes. Many traits remain the direction (decision 0058); this is not the place for the next one.

**Passengers who do not fight.** A second kind of party member, with rules of its own for who protects it, for nothing the cart does not already do.

**The whole party staying at the destination.** A supply run would then move every hero that guards it, and the origin would empty as the destination filled.

**A hub that fetches,** its caravans bringing stock from another camp to its own. One hub would then serve both directions and no hero would wait for a hub to be built; it is a second start transaction, debiting a camp the party is not at, and it takes away the reason to build the second hub.

**A share of the cargo by the cart's health.** A second number to explain before the first has been played.

**A broken cart ending the run.** The heroes marked to stay would then be turned back by the loss of something they were not carrying.

**A retreat that brings the cargo home.** A caravan would then risk nothing its party does not risk on any job, and decision 0058 kept a job's own stake for exactly this.

**The drops and the bonus credited at the destination.** Two rules for where an adventure's yield goes, by the kind of job, and an escort that comes home leaving what it found behind.

**A count of held slots on the camp's item.** One caravan is in flight at most, so the count would restate the open adventure.

**The cargo on the open-adventure item,** in the player table. Settlement conditions on the record and its result names what was delivered; the cargo beside them is one read and one condition fewer.

**A line for an arrival in the destination's "Recently here".** A second feed item for one adventure. An arrival shown where it happens suits step 4's live feed.

**Deciding here that a caravan costs energy.** Issue-337 is not decided, and the owner has asked for time on it.

## Facts checked

Read on 2026-11-23, in the DynamoDB API reference, `TransactWriteItems`:

- "`TransactWriteItems` is a synchronous write operation that groups up to 100 action requests."
- "The aggregate size of the items in the transaction cannot exceed 4 MB."
- "no two actions can target the same item. For example, you cannot both `ConditionCheck` and `Update` the same item."
- "These actions can target items in different tables, but not in different AWS accounts or Regions."

Not checked here, and for the build issues to check: how ElectroDB writes an item only if it is absent inside a transaction without cancelling it when the item exists (Issue-351), and the item count of the largest settlement as the code makes it (Issue-354).

## Where it is described

`docs/design/game.md`, "Locations and camps", "Unlocks", "Caravans", "The heroes hall" and "Resources". `docs/architecture/camps.md`, the keys and the items for unlocks and for a caravan's start, settlement and discard. `docs/architecture/adventure-loop.md`, the item for what the loop sees of an unlock and a caravan. `docs/architecture/overview.md`, "Build order". The build issues carry what each builds: Issue-350 to Issue-357.
