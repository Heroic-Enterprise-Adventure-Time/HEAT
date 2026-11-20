# 0058: What an adventure yields: drops by gathering trait, enemy XP, and jobs that vary

- **Status:** Decided; the numbers are working assumptions. Not built: Issue-339 builds the traits, the drops and the XP, Issue-340 the first new pair, hide and skinning, and Issue-341 the jobs that vary. Until each is merged the engine does what decisions 0030, 0031 and 0051 say.
- **Date:** 2026-11-20
- **Settles:** Issue-336: how resources are gathered, what an adventure yields and what a retreat keeps, and how one job's adventures differ. The owner's direction of 2026-11-19 and calls of 2026-11-20, made in the Issue-336 session.
- **Amends:** 0051: the gather rating, a node's difficulty and maximum yield, the per-hit harvest and the waste are replaced; a node as an obstacle with health, one list of opponents and a stage that ends when all of it is down stand. 0030, "Stages and time limits" and "Settlement": a stage's entries vary, the XP is the enemies' and a bonus, and a retreat's penalty is one rule for every job. 0031: the first job may meet a wolf, and the hauls are ranges; the costs and the one run per step stand.

## Decision

**A drop needs a gathering trait.** An enemy, a monster or a resource node, lists zero or more drops. Each drop names a resource and the trait that gathers it: a tree gives timber to a party that can cut wood, a wolf a hide to a party that can skin. A trait has a level, a whole number from 1.

**Who hit what does not matter.** When an enemy goes down, the highest level of the drop's trait among the heroes standing in that stage is read, and the drop is rolled for that level. A hero that is down does not count, so the carrier is worth protecting. With no carrier there is no drop. This replaces decision 0051's rule, where every hit harvested by the unit's gather rating against the node's difficulty and a hit with no rating wasted the node: a fighter is no longer wasted on a resource run, and one carrier of a trait is enough for a party. The owner's call: the puzzle is to cover every drop that may show up, a woodcutter for the trees and a skinner for the wolves, with a party that still survives the fight.

**The traits are named for the craft,** `woodcutting`, `mining` and `skinning`, not for a unit type, so that a lumberjack has woodcutting 2 and the API's two sets do not share their members.

**A trait is the unit type's,** a list of trait and level in its stats, where the gather ratings are, so the snapshot the hub serves stays the engine's field for field. The villager has woodcutting 1 and mining 1, the lumberjack woodcutting 2 and the miner mining 2 (the owner). The ranger has skinning 1 and the villager has none, so hide is the first drop a party gets nothing of without its carrier. A specialist carries its own trait alone to start with, where under decision 0051 it rated 1 in the other material. That is where the first unit types start and not a rule: the plan is many more unit types, some of them very good, and a unit type added later may carry several gathering traits, some at higher levels, as one of the ways it is made interesting (the owner, 2026-11-20).

**A drop is rows by level.** For each level of its trait a drop gives the chance, the least and the most; a level above the last row reads the last row. There is no formula between the levels: a rare wood that needs woodcutting 3 is a drop with no chance in its first two rows. A staple drops always, within a range, so that each step of the first progression is still paid by one run of the job before it at its worst roll (decision 0031).

**The roll is the enemy's own.** Each enemy's drops are rolled from a generator seeded by the adventure's seed, the stage and the enemy. No draw of the battle moves it and no override reaches it, so a modified client that tries override sequences against its seed (`docs/architecture/adventure-loop.md`, "What verification proves") can change which trait is standing when an enemy falls, which is the game, and not the roll.

**Not every drop is told.** A job's description says what its author chooses: "Pick up sticks" says that timber is collected and that a hero who can cut wood is needed; other jobs may say much less, and the rest is the player's to find. The job board and a job's page say the description, the stages by kind, the pay and the bonus XP, and no yield; the result says what dropped and what the warehouse's cap lost. What is hidden is hidden from the page only. The drop tables are static content in the engine package, which the browser runs and the public repository shows, and the owner's call is that nothing more is owed: a player who wants to know will ask another player sooner than read the source.

**Many resources and many traits are the direction,** added a little at a time. The mechanism is built with the two traits the game already has in another form, and then with one new pair, hide and skinning on the wolf. Nothing costs hide yet, which the owner accepted for the first pair.

**Enemies give XP.** Each enemy, a node included, has XP. A hero that survives earns the XP of every enemy that went down, in full and not shared out, and on arrival the job's bonus. The job's XP of decision 0030 is split between its enemies and its bonus so that each job gives what it gave.

**A retreat keeps the drops and the enemies' XP, and loses the pay and the bonus.** A party that is all down keeps nothing, as before. The retreat penalty each job stated, whether the pay and the cargo were kept and what share of the XP, becomes this one rule; a job's own penalty returns with caravans, whose cargo is not a drop (Issue-292).

**A job's adventures vary.** Each entry of a fight or a gather stage has a range for its count and a chance of appearing at all. The stages stay the same in number and kind, and the entries are a limited pool, so the adventures of a job are alike and not the same: gathering sticks is usually a tree, and once in a while a wolf. A job may have no variance. Every fight and gather stage has at least one entry that always appears, and its time limit fits its worst roll.

**The engine expands the stages from the seed,** with a generator of its own, before the first stage runs. The snapshot still names the job by its id and the submit is still the override log: the hub's replay expands the same stages, and the client reads the same expansion to load a run's cast. The seed is issued after the party is picked, so the player picks without seeing the roll.

**Replays.** A fallen enemy's drops are in the timeline and the `harvest` effect is gone, so both timeline schema versions go from 2 to 3 with Issue-339, and a timeline stored under another version is "replay unavailable", never migrated, as decision 0051 settled. Varying a job changes no event.

**Settlement does not change shape.** The result still carries the resources to credit and each hero's XP. An adventure that credits more kinds of resource writes one holding and one ledger entry for each in its one transaction, against DynamoDB's limit of 100 items; with a party of four that is room for about forty kinds in one adventure, and the count is checked when a job's drops come near it.

**The first numbers,** to be checked over seeds by the issues that build them.

| Enemy | Drop | Trait | Level 1 | Level 2 | XP |
| --- | --- | --- | --- | --- | --- |
| Tree | timber | woodcutting | always, 30 to 36 | always, 42 to 50 | 3 |
| Ore vein | ore | mining | always, 20 to 24 | always, 28 to 32 | 3 |
| Wolf | hide | skinning | half the time, 1 | always, 1 to 2 | 5 |
| Goblin rock thrower | none | | | | 5 |
| Bandit | none | | | | 6 |

| Job | Enemies' XP | Bonus | As today |
| --- | --- | --- | --- |
| Pick up sticks | 3 | 2 | 5 |
| Timber from the near woods | 11 | 4 | 15 |
| Wolves on the mill road | 10 | 10 | 20 |
| Ore from the hill | 11 | 4 | 15 |
| Goblins in the old workings | 19 | 6 | 25 |

At their worst rolls a villager's "Pick up sticks" brings 30 timber against the villager's 20, villagers' timber run 60 against the mine's 60, and villagers' ore run 40 against the fighter's 40. At their best a lumberjack's timber run brings 100 and a miner's goblins job 96, inside a level-1 warehouse's 100.

"Pick up sticks" gains a wolf one time in ten (Issue-341). A lone villager completes today's timber job, which ends in a wolf, on every one of 1,000 seeds (decision 0051), so the first job should stay one a free villager cannot fail; Issue-341 checks it over seeds, and if it fails on any the wolf leaves the first job.

## Considered and not chosen

**Keeping the waste of decision 0051.** The owner called it the point on 2026-11-10: a fighter was not worth bringing on a resource run. It made the party's question "is everyone here a gatherer", and with many resources that question has one answer for every job. Covering the drops is a different question for each job, and it is the one that a job's variance and, later, a limit on which heroes are free make harder.

**Every carrier adding to the drop,** two lumberjacks bringing more than one. The owner's rule is the highest level alone. A sum would bring back the party of gatherers.

**A trait on the hero,** learned or chosen at a level. Heroes are close to unit types, and what changes after recruitment changes numbers (game.md, "Heroes"). A level-up that raises a trait's level stays possible later, since a level is a number.

**The villager skinning at level 1,** as it cuts wood and mines. Every early party would then carry every trait, and the first new pair would show nothing of the puzzle.

**A formula from the level,** a base chance and amount and a step for each level above the first. Shorter content, and one more thing to explain; it cannot say that a drop needs level 3 without a second field.

**One generator for a battle's draws and its drops.** A drop table changed in the content would then change how every fight plays for a seed, and an override that changed the order of the battle's draws would change the drops.

**Telling the player a drop was missed,** such as "the wolf left something behind". The owner wants secrets to be found. It can be added for one job as a line of its description.

**Protecting the drop tables,** by holding them in the hub. The browser runs the engine (decision 0001), so the hub would have to roll the drops itself and the client could not show a run's yield as it happens. The owner's call is that the secrecy is the page's alone.

**Sharing an enemy's XP among the survivors.** The job's XP goes to each survivor in full today, and a shared XP would make a larger party level more slowly for the same work, a second cost on top of the risk it already takes.

**Keeping a share of the bonus on a retreat,** as half the job's XP is kept today. The enemies' XP is already what the party earned before it left.

**Weighted pools,** one of several types in a slot, a wolf or a bandit. A range and a chance on each entry is the smallest change to the list a stage has, and says the owner's example. A pool is added when a job needs it.

**Freezing the expanded stages in the snapshot.** The hub would write a larger record and the client would need no expansion of its own, but the version that issued an adventure is the only one that verifies it (decision 0030), so it always has the content and the seed to expand from, and the freeze buys nothing.

**Showing the roll before the party is picked.** The seed would have to be issued before the start, and a player could ask for seeds until one suited. Picking blind is why a skinner is brought in case.

**"Pick up sticks" with no variance,** to keep decision 0031's first job exactly as it was. The owner's own example of variance is this job. The engine's figures say a lone villager beats a lone wolf, and Issue-341 is where that is proved or the wolf is taken out.

## Where it is described

`docs/design/game.md`, "The battle", the item for decision 0058, and "Resources". `docs/architecture/adventure-loop.md`, "The loop". `docs/architecture/overview.md`, "Build order". The build issues carry what each builds: Issue-339, Issue-340 and Issue-341; Issue-291, the lumber camp's first job, follows them in the new shape.
