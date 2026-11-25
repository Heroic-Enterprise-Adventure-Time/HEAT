# 0058: What an adventure yields: drops by gathering trait, enemy XP, and jobs that vary

- **Status:** Decided; the numbers are working assumptions. Built by Issue-339: the traits, the drops, the XP and the one retreat rule; by Issue-340: the first new pair, hide and skinning, with the wolf's numbers as the table below gives them; and by Issue-341: the jobs that vary, with "Pick up sticks" and its wolf as their first use. Amended by Issue-339 on 2026-11-20, the owner's calls, in the first amendment below: the page does not list a job's stages, where the Decision says "the stages by kind", and a drop shows in the party panel's carrying line, with the scene's own picture of one for later (Issue-344). Amended by Issue-341 on 2026-11-22, the owner's call, in the second amendment below: a node is worked only when no monster is in the gather ability's reach, where the Decision has chop and mine aimed at the nodes of their kind whatever else is in reach. Amended by Issue-344 on 2026-11-23, in the third amendment below, which built the scene's picture of a drop: it rises with the enemy's fall, and its amount is pixel digits. Amended by Issue-291 on 2026-11-23, the owner's calls, in the fourth amendment below, which wrote the lumber camp's first job, the first written for this shape: the job passes a level-1 warehouse and is held to a level-2 one's, the acceptance that "The first numbers" leaves to the owner. Amended by 0059 on 2026-11-23, not built (Issue-354): where the Decision says "a job's own penalty returns with caravans", no job states a penalty, the one retreat rule stands for a caravan, and a retreat abandons its cargo.
- **Date:** 2026-11-20
- **Settles:** Issue-336: how resources are gathered, what an adventure yields and what a retreat keeps, and how one job's adventures differ. The owner's direction of 2026-11-19 and calls of 2026-11-20, made in the Issue-336 session.
- **Amends:** 0051: the gather rating, a node's difficulty and maximum yield, the per-hit harvest and the waste are replaced; a node as an obstacle with health, one list of opponents and a stage that ends when all of it is down stand. 0030, "Stages and time limits" and "Settlement": a stage's entries vary, the XP is the enemies' and a bonus, and a retreat's penalty is one rule for every job. 0031: the first job may meet a wolf, and the hauls are ranges; the costs and the one run per step stand. 0052: a shot at a node no longer wastes what it takes; a shot that hits a node only when nothing else is in reach stands.

## Decision

**A drop needs a gathering trait.** An enemy, a monster or a resource node, lists zero or more drops. Each drop names a resource and the trait that gathers it: a tree gives timber to a party that can cut wood, a wolf a hide to a party that can skin. A trait has a level, a whole number from 1.

**Who hit what does not matter.** When an enemy goes down, the highest level of the drop's trait among the heroes standing in that stage is read, and the drop is rolled for that level. A hero that is down does not count, so the carrier is worth protecting. With no carrier there is no drop. This replaces decision 0051's rule, where every hit harvested by the unit's gather rating against the node's difficulty and a hit with no rating wasted the node: a fighter is no longer wasted on a resource run, and one carrier of a trait is enough for a party. The owner's call: the puzzle is to cover every drop that may show up, a woodcutter for the trees and a skinner for the wolves, with a party that still survives the fight.

**A unit aims as it did, without the rating.** A regular attack is aimed at a monster first and at a node only when nothing else is in reach, and chop and mine are aimed at the nodes of their kind, the one with the least health left first. Decision 0051's order among nodes, those a unit could harvest before those it would waste, goes with the rating. A ranger still shoots a node last (decision 0052), and its shot wastes nothing, because nothing is harvested by a hit.

**The traits are named for the craft,** `woodcutting`, `mining` and `skinning`, not for a unit type, so that a lumberjack has woodcutting 2 and the API's two sets do not share their members.

**A trait is the unit type's,** a list of trait and level in its stats, where the gather ratings are, so the snapshot the hub serves stays the engine's field for field. The villager has woodcutting 1 and mining 1, the lumberjack woodcutting 2 and the miner mining 2 (the owner). The ranger has skinning 1 and the villager has none, so hide is the first drop a party gets nothing of without its carrier. A specialist carries its own trait alone to start with, where under decision 0051 it rated 1 in the other material. That is where the first unit types start and not a rule: the plan is many more unit types, some of them very good, and a unit type added later may carry several gathering traits, some at higher levels, as one of the ways it is made interesting (the owner, 2026-11-20).

**A drop is rows by level.** For each level of its trait a drop gives the chance, the least and the most; a level above the last row reads the last row. There is no formula between the levels: a rare wood that needs woodcutting 3 is a drop with no chance in its first two rows. A staple drops always, within a range, so that each step of the first progression is still paid by one run of the job before it at its worst roll (decision 0031).

**The roll is the enemy's own.** Each enemy's drops are rolled from a generator seeded by the adventure's seed, the stage and the enemy. No draw of the battle moves it and no override reaches it, so a modified client that tries override sequences against its seed (`docs/architecture/adventure-loop.md`, "What verification proves") can change which trait is standing when an enemy falls, which is the game, and not the roll.

**Not every drop is told.** A job's description says what its author chooses: "Pick up sticks" says that timber is collected and that a hero who can cut wood is needed; other jobs may say much less, and the rest is the player's to find. The job board and a job's page say the description, the stages by kind, the pay and the bonus XP, and no yield; the result says what dropped and what the warehouse's cap lost. A job's page shows the camp's balance and the warehouse's room for the pay alone: the room for a drop would name the drop, and the warehouse's panel is where the room for everything is shown (the owner, 2026-11-20). What is hidden is hidden from the page only. The drop tables are static content in the engine package, which the browser runs and the public repository shows, and the owner's call is that nothing more is owed: a player who wants to know will ask another player sooner than read the source.

**Many resources and many traits are the direction,** added a little at a time. The mechanism is built with the two traits the game already has in another form, and then with one new pair, hide and skinning on the wolf. Nothing costs hide yet, which the owner accepted for the first pair.

**Enemies give XP.** Each enemy, a node included, has XP. A hero that survives earns the XP of every enemy that went down, in full and not shared out, and on arrival the job's bonus. The job's XP of decision 0030 is split between its bonus and the enemies that always appear, so that a job with no variance gives what it gave. An enemy that appears by chance adds its own XP: "Pick up sticks" gives 5 as it did, and 10 when its wolf appears.

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

At their worst rolls a villager's "Pick up sticks" brings 30 timber against the villager's 20, villagers' timber run 60 against the mine's 60, and villagers' ore run 40 against the fighter's 40. At their best a lumberjack's timber run brings 100 and a miner's goblins job 96, inside a level-1 warehouse's 100. That holds for the stages as they are today, with fixed counts: when Issue-341 gives an entry a range for its count, it checks the job's largest roll against the warehouse, or the owner accepts what the cap would lose.

"Pick up sticks" gains a wolf one time in ten (Issue-341). A lone villager completes today's timber job, which ends in a wolf, on every one of 1,000 seeds (decision 0051), so the first job should stay one a free villager cannot fail; Issue-341 checks it over seeds, and if it fails on any the wolf leaves the first job.

## Amendment: the page lists no stages, and how a drop shows (Issue-339, 2026-11-20)

The owner's calls at the start of Issue-339, which built the traits, the drops and the XP.

**The page does not list a job's stages.** "Not every drop is told" above has the job board and a job's page say "the stages by kind". The owner's call is that they say none: travel adds nothing, an arrival is not a stage of its own, and a fight and a gather run alike now that a hit gathers nothing, so a list of kinds tells the player little, and the description is where a job says as much or as little as its author decides. The job board lists a job's pay and its bonus XP; a job's page its description, its pay with the camp's balance and the warehouse's room, its bonus XP and the one retreat rule; and the adventure's page names no stage while it is played. The stages stay the engine's, and a result and a replay's line still say how each stage ended.

**A drop shows in the party's panel.** While an adventure is played, the line that says what the party carries counts up the moment the enemy falls, where it changed only at a stage's end, and says nothing for a drop the party could not gather. The scene's own picture of a drop, the resource's icon and its amount where the enemy fell, is for later (Issue-344).

**What Issue-339 chose where this record is silent.** A row's chance is a whole percent, and its amount is uniform between its least and its most. Each drop takes its two draws from the enemy's generator whatever the party's level and whether or not anyone carries its trait, so an enemy on a seed rolls the same at every level, and a drop listed after another does not depend on it. A hero is standing if it is alive in that battle at the moment the enemy goes down. A hero alive at the adventure's end earns the XP of every enemy that went down in any stage. A drop that falls is an event of its own in the timeline, and a drop nobody could gather leaves none, since a replay is public. A gather ability names the trait whose nodes it is aimed at, whoever swings. The API's `gather` and `GatherRating` are replaced outright by `traits`, `TraitLevel` and the `GatheringTrait` enum, as Issue-283 replaced `gathering`; a tab loaded before the deploy is refused the documents that ask for `gather` until it reloads, and the owner's call on the review of PR-345 was to have the client read the hub's `outdated` flag off such a refusal from here on, over keeping `gather` as a deprecated field for one deploy.

Not chosen in this issue: **the stages by kind**, "Travel, Gather, Fight, Arrive", on a job's page and above the party while it is played, the agent's reading of the Decision, which the owner turned down as above; and **the scene's drop in the same pull request**, which needs an icon for each resource and digits in a scene that draws no text, and is display work judged by looking (Issue-344).

## Amendment: a node is worked only with no monster in reach, and what the jobs that vary chose (Issue-341, 2026-11-22)

The owner's call at the start of Issue-341, which built the jobs that vary, and what the check of the first job found.

**A node is worked only when no monster is in the gather ability's reach.** "A unit aims as it did" above has chop and mine aimed at the nodes of their kind, in their place in a unit's list, whatever else is in reach. The first job's wolf was checked before any code, over 5,000 seeds with the wolf beside the tree on every one:

| Party | Outcome | Deaths |
| --- | --- | --- |
| 1 villager, nothing forced | complete 5,000 | 0, with as little as 3 of 30 health left |
| 1 villager, a chop forced on its first turn only | defeat 4,899 | 4,899 |
| 1 villager, a chop forced every turn | defeat 5,000 | 5,000 |
| 1 lumberjack or 1 miner, nothing forced | defeat 5,000 | 5,000 |
| 2 lumberjacks | complete 5,000 | 143 |

A chop is a strike the wolf does not take, and a specialist's list works a node before it strikes. Decision 0031's test of the first job is the worst a player can do with forced actions, so by that test the wolf failed. The owner asked whether any reason to force a chop was left. Since a hit gathers nothing, almost none: with no monster in reach the list chops already, and with one in reach a chop only turns the unit's back on it. So a gather ability has no target while a monster stands on a line it reaches, in a unit's list and forced alike, and a chop forced then is dropped as any force that cannot be used is. It is the rule for a regular attack, read from the node's side.

With the rule, and the wolf on every one of 5,000 seeds: a lone villager, a lone lumberjack and a lone miner each complete the first job with no death and as little as 3 health left, and a villager forced to any one of its four abilities every turn has the same run as one left alone. No job that existed changes, because none puts a monster in a melee hero's reach beside a node: the goblins stand behind the veins until the veins fall. What the rule gives up is felling a node early, with a monster still in reach, to take its drop before its carrier falls or a retreat lands.

**The wolf stays in the first job** (the owner, 2026-11-22). It is there on 45 of the tests' 500 seeds and on 509 of 5,000. A lone ranger completes the job with the wolf on every seed and takes a hide on about half of them; a lone fighter completes it with no timber and no hide. The job's description no longer says "nothing out there bites", and says nothing in its place.

**What Issue-341 chose where this record is silent.** An entry's count is one number, or a least and a most with the roll uniform between them. Its chance is a whole percent from 1 to 99, and an entry that always appears states none. The expansion has one generator for the whole job, seeded by the adventure's seed alone, and every entry takes two draws from it, its chance and its count, whether or not it varies, so a chance given to one entry does not move the roll of the next. An entry that does not appear leaves no unit and no event. The engine expands in its constructor, which a live run and `replay` both go through, so the hub has no code of its own for it. The client's cast calls the same function with the adventure's seed and loads the wolf's art only for a run that has a wolf, where decision 0028's amendment of Issue-205 loaded whoever might appear: the roll is made before the run starts, so who will appear is known then. A stage whose roll is empty fails at construction with the job's name. The content's test keeps that from happening, plays every job's largest roll with one villager and with four over 500 seeds so that no stage runs out its time limit, and sums every job's largest roll at the best row of each drop against a level-1 warehouse's 100. No job has a range for a count yet, so that sum is what "The first numbers" above gives: 100 timber for the timber job and 96 ore for the goblins job. An adventure open across the deploy is verified by the version that issued it, whose first job has no wolf; a page that resumes it with this engine shows a wolf on the seeds that roll one, and the result is the issuing version's, the case Issue-340 accepted for hide.

Not chosen in this issue: **the wolf out of the first job, with a second tree some of the time as the first use,** which is safe and shows nothing of covering what may show up; **keeping the wolf and reading "cannot fail" as "with nothing forced",** the agent's first recommendation, which left a new player one click from losing the free villager and a lone lumberjack dead on one run in ten; **a specialist's list that strikes first,** which mends the list and not the forced chop; **Chop and Mine taken off the page,** since a unit's list is its buttons, and the two still choose which kind of node is worked first where a stage has both; **a generator for each entry,** as each enemy has for its drops, which two draws an entry from one generator already give within a version; and **the cast as whoever may appear,** which waits for a wolf's art on nine runs in ten that have no wolf.

## Amendment: the scene's picture of a drop (Issue-344, 2026-11-23)

What the first amendment left for later, as the owner agreed it at the start of Issue-344 and as it was built.

**The picture.** Where an enemy falls and something drops, the resource's icon rises from it with the amount on its lower right, and is gone. It is drawn from the `drop` event, so a stored replay shows the same with no engine, and a drop the party did not get, which leaves no event, shows nothing: the scene tells no more than the panel does. The icon is the page's own 32 px icon of the resource at one art pixel to a scene pixel, about two thirds of a hero's height; timber and ore were picked from the pack hide came from, timber 6 the agent's recommendation and ore 14 the owner's choice over the agent's 11.

**The rise begins with the fall** (the owner, 2026-11-23), as the blow or the projectile that felled the enemy lands, so the adventure's clock waits for the longer of the two and not for their sum (decision 0057): a tree's fall is 0.9 seconds and hides the whole of the rise's 0.6. Where a fight follows a gather in the same instant, the last node's drop rises while the road carries it off behind the party, and the entry's own wait stands in place of the hold.

**The amount is pixel art** (the owner, 2026-11-23): the digits are sprites cut from a pixel font made by PixelLab, at the scene's scale, so that PixelLab stays the one source of pixel art (decision 0025). The font's atlas is committed as the service drew it and the build gives the digits their colour and outline (`docs/process/assets.md`, rule 37).

**A resource an enemy drops has its icon,** held by a test, and an icon's making is a runbook and a script (`docs/runbooks/resource-icon.md`), since resources and traits will be added a little at a time (the owner).

Not chosen in this issue: **the rise after the fall,** which reads more literally as "where it fell" and costs the rise's length again at every enemy; **digits drawn by hand in a script,** which would have been a second source of art and a decision of its own; **the browser's text over the canvas,** which is smoothed and scaled apart from the art; **icons made again at 16 px,** kept for the case that 32 px looks wrong in the scene; and **a plus sign or the resource's name beside the amount,** which the icon already says.

## Amendment: the lumber camp's first job, and the warehouse it passes (Issue-291, 2026-11-23)

The owner's calls at the start of Issue-291, which wrote the first job for this record's shape where the five before it were converted to it.

**The job.** "Lumber from the deep woods", posted by the lumber camp: travel, one gather stage of three trees or four with a wolf or two among them on half its runs, arrive. It is the owner's picture of the puzzle as a job: a woodcutter for the trees and a skinner for the wolves that may appear, in a party that survives them. It has no pay, as the mine's jobs have none, and a bonus of 6 XP, so a survivor earns 15 at its least roll, what the mine's first job gives, and 28 at its largest. The issue's body, agreed on 2026-11-10 under decision 0051, asked for the job's "node difficulties"; a node has had none since this record, so what was agreed is the entries and their rolls.

**The job passes a level-1 warehouse, and the owner accepts what the cap loses.** "The first numbers" above has a job's largest roll checked against a level-1 warehouse's 100, "or the owner accepts what the cap would lose". The issue asks for clearly more timber than the board's timber job, which already reaches 100 at a lumberjack's best roll, so no such job fits. This one brings villagers 90 to 144 timber and a lumberjack 126 to 200, its worst roll above the timber job's best for both, and is held to a level-2 warehouse's 200. A camp with a level-1 warehouse loses what is over and the result says how much; the job's page shows the room for the pay alone, as "Not every drop is told" has it, and gives no warning. The camp has ore by the time it has a lumber camp, which costs 20, and the warehouse's second level costs 80 timber and 40 ore, so the job is a reason to build it (the agent's reading, accepted with the shape).

**The numbers,** over 500 seeds, `seed-0` to `seed-499`, with nothing forced. 256 of them roll no wolf, 120 one and 124 two; 234 roll three trees and 266 four.

| Party | Complete | Defeat | Runs with a death | Timber | Hide |
| --- | --- | --- | --- | --- | --- |
| 1 villager | 376 | 124 | 124 | 90 to 141 | none |
| 2 villagers | 494 | 6 | 51 | 90 to 144 | none |
| 3 villagers, 4 villagers | 500 | 0 | 0 | 90 to 144 | none |
| 1 lumberjack | 376 | 124 | 124 | 127 to 196 | none |
| lumberjack, villager | 494 | 6 | 51 | 95 to 199 | none |
| lumberjack, fighter | 500 | 0 | 0 | 126 to 199 | none |
| lumberjack, ranger | 441 | 59 | 124 | 0 to 196 | on 103 runs |
| lumberjack, fighter, ranger | 500 | 0 | 0 | 126 to 199 | on 140 runs, 162 from 368 wolves |
| lumberjack, villager, ranger | 500 | 0 | 1 | 126 to 199 | on 140 runs |
| fighter, villager | 500 | 0 | 0 | 90 to 144 | none |
| 1 fighter | 445 | 55 | 55 | none | none |
| 1 ranger, 1 miner | 376 | 124 | 124 | none | a ranger's, on 55 runs |

Every defeat is on a seed that rolls two wolves. A lone villager, lumberjack, miner or ranger is defeated on every one of those, one run in four, and completes every other; a fighter alone falls on 55 of the 124. The timber of a completed run is counted, so a range that starts below its trees' least is a run whose carrier fell: a lumberjack with a ranger alone is the worst pair, because where the lumberjack falls the ranger fells the trees for nothing. The longest run is 78 seconds of the stage's 180. Forced actions were not played against this job: decision 0031's test of the worst a player can force is the first job's alone.

**What Issue-291 chose where this record is silent.** The level a job is held to is content: `JOB_WAREHOUSE_LEVEL` in `packages/engine/src/content.ts` names each job that passes a level-1 warehouse with the one resource the owner accepted that for and the level whose cap holds its largest roll, timber at level 2 for this job. The content's test holds every other resource of the job, and every other job, to level 1, and refuses an entry whose resource does not pass the level below, so the list excuses nothing that needs no excuse. The resource was added on the review of PR-349: the list first let every resource of a named job past, where the acceptance was for timber. A facility's job is content alone: the hub and the client read it from `jobsPostedBy`, and the hub's data-layer tests of a facility's job run for every facility of Millbrook that posts one.

Not chosen in this issue: **three trees with no range,** the alternative put to the owner, which has the same fights for 90 to 108 and 126 to 149 timber, passes a level-1 warehouse all the same, and leaves the content with no node whose count is a range; **holding the job to a level-1 warehouse,** which cannot bring clearly more than a job that already reaches it; **a warehouse level the job needs before it can be started,** a new refusal for what the result already says; and **a warning of the room on the job's page,** which would name the drop. Probed by the agent and not put to the owner: **the wolves as a fight after the gather,** one always and a second half the time, as the timber job ends, which defeats a lone hero on half its runs and makes the wolf something the job always has; and **two trees or three with a wolf on every run and a second on a third of them,** whose least roll is the timber job's 60.

## Considered and not chosen

**Keeping the waste of decision 0051.** The owner called it the point on 2026-11-10: a fighter was not worth bringing on a resource run. It made the party's question "is everyone here a gatherer", and with many resources that question has one answer for every job. Covering the drops is a different question for each job, and it is the one that a job's variance and, later, a limit on which heroes are free make harder.

**Every carrier adding to the drop,** two lumberjacks bringing more than one. The owner's rule is the highest level alone. A sum would bring back the party of gatherers.

**A trait on the hero,** learned or chosen at a level. Heroes are close to unit types, and what changes after recruitment changes numbers (game.md, "Heroes"). A level-up that raises a trait's level stays possible later, since a level is a number.

**The villager skinning at level 1,** as it cuts wood and mines. Every early party would then carry every trait, and the first new pair would show nothing of the puzzle.

**A formula from the level,** a base chance and amount and a step for each level above the first. Shorter content, and one more thing to explain; it cannot say that a drop needs level 3 without a second field.

**One generator for a battle's draws and its drops.** A drop table changed in the content would then change how every fight plays for a seed, and an override that changed the order of the battle's draws would change the drops.

**Telling the player a drop was missed,** such as "the wolf left something behind". The owner wants secrets to be found. It can be added for one job as a line of its description.

**Protecting the drop tables,** by holding them in the hub. The browser runs the engine (decision 0001), so the hub would have to roll the drops itself and the client could not show a run's yield as it happens. The owner's call is that the secrecy is the page's alone.

**A job that lists the drops it tells,** with the warehouse's room shown for those on its page. It keeps the warning that the warehouse is nearly full for a told drop, at the cost of one more field on every job that has to agree with its description. The owner's call is the pay alone.

**Sharing an enemy's XP among the survivors.** The job's XP goes to each survivor in full today, and a shared XP would make a larger party level more slowly for the same work, a second cost on top of the risk it already takes.

**Keeping a share of the bonus on a retreat,** as half the job's XP is kept today. The enemies' XP is already what the party earned before it left.

**Weighted pools,** one of several types in a slot, a wolf or a bandit. A range and a chance on each entry is the smallest change to the list a stage has, and says the owner's example. A pool is added when a job needs it.

**Freezing the expanded stages in the snapshot.** The hub would write a larger record and the client would need no expansion of its own, but the version that issued an adventure is the only one that verifies it (decision 0030), so it always has the content and the seed to expand from, and the freeze buys nothing.

**Showing the roll before the party is picked.** The seed would have to be issued before the start, and a player could ask for seeds until one suited. Picking blind is why a skinner is brought in case.

**"Pick up sticks" with no variance,** to keep decision 0031's first job exactly as it was. The owner's own example of variance is this job. The engine's figures say a lone villager beats a lone wolf, and Issue-341 is where that is proved or the wolf is taken out.

## Where it is described

`docs/design/battle.md`, the items for decision 0058. `docs/design/game.md`, "Resources". `docs/architecture/adventure-loop.md`, "The loop". `docs/architecture/overview.md`, "Build order". The build issues carry what each builds: Issue-339, Issue-340 and Issue-341; Issue-291, the lumber camp's first job, followed them in the new shape, and what it built is the item after Issue-344's in `docs/architecture/adventure-loop.md`, with the job in `docs/design/battle.md`, under "Millbrook's board". What Issue-339 built is `docs/architecture/adventure-loop.md`, the item built by Issue-339, what Issue-340 built the item after it, what Issue-341 built the item after that, and what Issue-344 built, the scene's picture of a drop, the item after that, with `docs/process/assets.md`, rules 37 and 38; the roll is `packages/engine/src/battle/drops.ts`, the expansion `packages/engine/src/adventure/expand.ts`, and the rule for a node `packages/engine/src/battle/resolution.ts`.
