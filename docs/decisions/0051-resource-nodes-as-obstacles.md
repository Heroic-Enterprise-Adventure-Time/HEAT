# 0051: Resource nodes as obstacles: health, a difficulty and a maximum yield, harvested by a gather rating per resource

- **Status:** Decided; the numbers are working assumptions in the engine's static content.
- **Date:** 2026-11-10
- **Settles:** Issue-283: how a resource node is fought and harvested, before any more gathering jobs are added, so that a better gatherer is worth bringing on a resource run. The shape was agreed with the owner in the step 3 design session (Issue-282); the arithmetic and the numbers in the Issue-283 session.
- **Amends:** 0030, "Stages and time limits": a fight or a gather lists nodes and monsters together and ends when all of them are down; and the timeline's schema version, which the first cut left to be decided when it first moved. 0031, "Checked with the engine": the gather jobs' hauls and the table below replace its rows for them; its costs stand.

## Decision

**A node is an obstacle.** It has health, a difficulty, a resource and a maximum yield. It holds its line like a monster and never acts. Before this a node's health was the material it held, a gather ability did the unit's one `gathering` stat as work, and a regular attack did half its damage as work for half of that as yield.

**A unit type has a gather rating per resource,** replacing the single `gathering` stat: a villager low in everything, a combat unit none, a specialized gatherer high in one. The rating is the unit's, in its stats and so in the adventure's snapshot, not the ability's (the owner: fine, so long as it is specific to the resource). It is a list of `{ material, rating }`, a material with no entry being 0, so the snapshot the hub serves stays the engine's field for field.

**Any hit on a node does the unit's normal damage to the node's health, and harvests by the rating.** Each node keeps a running credit. A hit adds the damage it did, which stops at the health the node has left, times `min(rating, difficulty)`. The material harvested from the node so far is

```
floor(credit × maximum / (health × difficulty))
```

and a hit's yield is that total after the hit less the total before it. Whole numbers, rounded down on the node's running total and never on each hit, so a unit that meets the difficulty all the way down harvests exactly the maximum, and a rating above the difficulty harvests no more.

**A node destroyed before its maximum is harvested loses the rest.** A hit with a zero rating adds no credit and takes health all the same, so it wastes its share of the node. That is intended (the owner): a fighter is not worth bringing on a resource run.

**Targeting.** A unit with no rating for a node's resource hits a node only when nothing else is in reach. A unit's list is still walked twice (Issue-110): first with regular attacks aimed at units, gather abilities at the nodes of their resource the unit has a rating for, and guard and move up as they are; then, only if nothing was usable, with regular attacks aimed at nodes, those the unit has a rating for before those it has none for, and gather abilities at the nodes of their resource whatever the rating.

**Chop and mine stay as abilities for their look.** Each is a strike at a node of its resource: the same damage, and the same 300 ms warmup, down from 500 ms, because with the yield no longer the ability's a forced strike at a tree would otherwise beat chopping it.

**A stage lists what stands on the other side, nodes and monsters together, and ends when all of it is down.** The "party is loaded" ending and the carry limit are gone; the nodes' maximums are a job's ceiling. A fight and a gather run alike and both carry one `opponents` list; the kind stays as how the stage reads in a result and in the scene. The stage's time limit stays as the deadlock switch, and a retreat still keeps what was gathered.

**The first numbers.**

| Node | Health | Difficulty | Maximum |
| --- | --- | --- | --- |
| Tree | 40 | 3 | 45 timber |
| Ore vein | 40 | 3 | 30 ore |

| Unit type | Timber | Ore |
| --- | --- | --- |
| Villager | 2 | 2 |
| Fighter, wolf, bandit | none | none |

A villager brings home two thirds of a node, 30 timber a tree and 20 ore a vein. "Pick up sticks" is one tree; "Timber from the near woods" is two trees, down from three, then the wolf; "Ore from the hill" is two veins, then the wolf; "Wolves on the mill road" is unchanged. The costs of decision 0031 stand, and each step is still paid by one run of the job before it: 30 timber for a villager at 20, 60 timber and 3 cloth for the mine at the same, 40 ore for a fighter at 40. Every job's ceiling, 45 timber, 90 timber and 60 ore, fits a level-1 warehouse.

**Checked with the engine** (`replay`, 1,000 seeds per party, no overrides unless said):

| Job | Party | Outcome | Deaths per run | Brings home |
| --- | --- | --- | --- | --- |
| Pick up sticks | 1 villager | complete 1,000 | 0 | 30 timber |
| Pick up sticks | 1 villager, forced to strike every turn | complete 1,000 | 0 | 30 timber |
| Pick up sticks | fighter + villager | complete 1,000 | 0 | 7 to 9 timber |
| Pick up sticks | fighter alone | complete 1,000 | 0 | nothing |
| Timber from the near woods | 1, 2 or 3 villagers | complete 1,000 | 0 | 60 timber, 3 cloth |
| Timber from the near woods | fighter + villager | complete 1,000 | 0 | 18 to 21 timber, 3 cloth |
| Ore from the hill | 1 or 2 villagers | complete 1,000 | 0 | 40 ore |
| Ore from the hill | fighter + villager | complete 1,000 | 0 | 12 to 14 ore |
| Ore from the hill | fighter + 2 villagers | complete 1,000 | 0 | 16 to 21 ore |
| Ore from the hill | fighter alone | complete 1,000 | 0 | nothing |
| Wolves on the mill road | every party of 0031's table | as in 0031 | as in 0031 | as in 0031 |

The longest gather in those runs is 31 s, a lone villager on two nodes, against limits of 60 s and 90 s. The engine's tests replay each gather job over 500 seeds per party.

**A fighter beside a villager on a gather stage wastes most of it.** On a stage of nodes alone the fighter has nothing else in reach, so it hits the nodes every turn, and it hits harder and faster than the villager. Decision 0031's row for the ore job with a fighter and a villager read 40 ore; it is 12 to 14 now. The progression is not touched, because the ore job is run before a fighter exists. The owner was shown the figure before the build and kept the fighter at no rating.

**Replays.** A `harvest` effect's `amount` is now damage and its `yield` is by rating, a battle may hold nodes and monsters together, and the party's stats in a timeline carry ratings, so the battle's and the adventure's timeline schema versions go from 1 to 2. A timeline stored under another version is "replay unavailable": the client compares the stored version with its engine's (`isPlayableTimeline`) and says so in place of playing it. None is migrated (the owner, who also agreed no backfill for step 3's lists, decision 0050). An adventure open across the deploy is verified by the deploy that issued it, as always (decision 0030); the hub answers its snapshot, which has no ratings, with each hero's unit type's ratings of today, added where the record is read, so a client that reloads in the middle of the run shows it gathering. That picture is the new rules' and the result is the issuing deploy's, so the two may differ for such a run.

## Considered and not chosen

**The rating on the ability,** a chop that harvests and a strike that does not. The owner's rule is that the rating is specific to the resource, and on the unit type one number says what a unit is worth on a run whatever it swings; on the ability the list, not the unit, would decide the yield, and a forced strike would be a way to waste a node by hand.

**Rounding each hit down.** A villager's hit on a node with a small maximum would round to nothing every time, and a node's total would depend on how its health was divided among hits. The running total makes the yield a property of who did the damage.

**A rating of 1 for the fighter.** It softens the waste, about 22 ore where a rating of none brings 13. The owner's call is that the waste is the point.

**A zero-rating unit that stands idle on a stage of nodes alone.** The stage ends only when every node is down, so a party of fighters would stand until the time limit; and the owner's rule is that such a unit hits a node when nothing else is in reach.

**The rating as a map by material** in the engine, `{ timber: 2, ore: 2 }`. Shorter in the content, but GraphQL has no map, so the hub would serve a list and the client would rebuild the map, and the snapshot would stop being the engine's field for field. A list is what a cost and a reward already are.

**One stage kind** in place of fight and gather, since they now run alike. The kind is in the API's enum, in a result's stages and in the client's words and scene; merging them would change all of those for nothing the player sees. The job board's words are taken from what the stage lists, not from its kind.

**A tree at 60 timber,** so that a villager still brought home 40 from the first job as before. Two trees would then give a specialized gatherer 120, past the 100 a level-1 warehouse holds.

**Keeping the timber job at three trees.** Villagers would bring home 90, half as much again as the mine costs, and the ceiling would be 135.

**Migrating stored timelines** to the new version. A version-1 `harvest` event cannot be turned into what the new rules would have done, only relabelled, and the only timelines stored are from before step 3's lists exist to show them.

## Where it is described

`docs/design/game.md`, "The battle". `docs/architecture/adventure-loop.md`, "The loop", the schema version and the item built by Issue-283. The rule is in `packages/engine/src/battle/unit.ts` (`harvested`), `engine.ts` and `resolution.ts`; the numbers and the jobs in `packages/engine/src/content.ts`.
