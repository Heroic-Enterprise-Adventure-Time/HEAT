# The game

What the player does in HEAT. How the system delivers it is in `docs/architecture/overview.md`. Nothing described here is built yet unless it says so.

Each item carries a status. **Decided** items are settled by the project owner. **Working assumption** items were proposed during design and not yet objected to: build on them, but expect them to be revisited. **Open** items are not yet answered.

## The business

- **Decided.** The player runs an adventuring business.
- **Decided.** Heroes are close to unit types: every hero of a unit type starts with the same stats and abilities as every other, and what changes afterwards changes numbers, never abilities (see "Heroes"). Adding a unit type should be simple.
- **Decided (direction, if time allows).** Progression means gaining unit types that get more done with less intervention, automating what the player used to do by hand and freeing them for the next problem.
- **Decided.** A **job** is the template; an **adventure** is one run of a job. The names may change.
- **Decided.** Jobs are more than battles. Examples: take a cart of goods from one settlement to another; go into the forest, chop lumber and return safely; fight through a hundred goblins and kill their king. An adventure progresses linearly, doing things along the way.
- **Working assumption.** An outcome is richer than win or lose: how far the party got, what it gathered or delivered, who was lost.
- **Decided.** The villager is the starting hire: cheap to hire, with no specialized skills. Specialized laborers, such as a miner or a lumberjack, come later as unit types of their own.

## Heroes

What makes one hero different from another of the same unit type. Nothing here changes a unit type's AI or gives a hero an ability its unit type lacks: every unit type keeps one way of choosing its actions.

- **Decided.** Appearance is cosmetic. At recruitment a hero is given a sprite set, drawn at random from the sets its unit type allows, and a name, drawn at random from a fixed list. A set may serve more than one unit type. The hero keeps both for good.
- **Decided.** The name suits the sprite. Every sprite set and every name is labelled masculine, feminine or either. A masculine set takes a masculine or either name, a feminine set a feminine or either name, and an either set any name. The name is drawn after the set, and avoids the names of the camp's living heroes while any are left. Heroes recruited before the labels keep their names. There is no renaming, so no text a player wrote is ever shown to another player, and the game needs no moderation.
- **Decided.** Advancement. A hero earns XP in adventures, credited at settlement, and XP brings levels. Each level offers a choice between small, fixed stat boosts from the unit type's list, so two heroes of the same unit type and level can differ.
- **Decided (direction).** Advanced classes. A hero may later move to an advanced class, which swaps its unit type and starts it again at level one. A temporary dip in strength is acceptable; an advanced class at its top level beats its base class at its top level.
- **Decided.** Weapons. Each unit type uses one weapon kind and no other: rangers use bows, knights use swords. A weapon changes numbers, never abilities. Weapons are crafted from materials; a rare weapon needs at least one rare material.
- **Working assumption.** A weapon lasts a number of fights, a fight being one battle stage. A hero whose weapon breaks fights on with its unit type's unarmed numbers, so a broken weapon never strands a party.
- **Decided.** Death. A hero can die for good. Bringing a dead hero back always costs a resource or a consumable and needs a facility. Cheaper forms carry a penalty: lost XP, a lost level, or time to recover. The cheapest form comes early in the camp's progression, so losing a villager on a boss run hurts without being frustrating. A dead hero stays on the record with its history.
- **Working assumption.** Consumables. Crafted from materials and taken on an adventure in a small pack chosen at the start, which goes into the adventure's snapshot. Each is used through an override: party-wide heals, shields and bonuses that let a player spend their way through a hard mission. Unused consumables return to the player's holdings at settlement.
- **Decided.** History. Each hero keeps a record of what it has done, such as adventures survived, monsters defeated and goods delivered.
- **Open.** The stat boosts each unit type offers, the XP curve, which advanced classes exist, and the costs of resurrection, weapons and consumables.

## How the game looks

The rules for making a hero's sprite set are `docs/process/assets.md`, rules 8 to 13, for a camp's ground and facilities rules 14 to 19, for the page's icons rules 25 to 27, and for the battle's monsters and props rules 28 to 31; this section says what the player sees.

- **Decided.** One view for camp and battle: low top-down, about 20 degrees, the classic 3/4 view of an RPG town. Battle arranges the same sprites so that it reads as side-on.
- **Decided.** An NES-era look, with Final Fantasy 1 as the reference: warm, earthy colours, a black outline, few colours per sprite, characters 32 px tall.
- **Decided.** Characters, monsters, environment and UI share one theme. Ranger 01 (`art/heroes/ranger-01/`) is the baseline.
- **Decided.** Characters hold nothing. Every action, whatever the ability, is the hero's act animation, a three-frame lead jab whose middle frame is held for as long as the action lasts, played with two separate sprites: the weapon, which appears beside the hero, and the ability's effect, such as a slash, an arrow or a spell. A weapon's one sprite is also its icon in the inventory. Its motion is drawn as animation frames, not rotated in code, because rotated pixel art blurs at any angle but a right angle.
- **Decided.** A sprite set's animations are walk, stance, act, hit and down. A hero standing outside battle is its still frame; there is no idle animation.
- **Decided.** A camp stands on a 16 px tiled ground with no outline, so that the outlined buildings and heroes stand off it. Each facility is one sprite at a three-quarter angle, front wall facing down-right, the same for every facility. A facility's level may change its picture, never its size or its angle (decision 0027).
- **Decided.** The page's icons, such as a facility's entry in the menu, and the favicon, are 32 px pixel art in the same look, drawn at a whole-number scale. The favicon is a gold coin with a sword through it: money and a weapon, the business of adventuring (Issue-89).

## The page

How the page around the scene is laid out (Issue-89). The scene's own rules are in "Locations and camps" and decision 0028.

- **Decided.** Four regions, and nothing overlaps. The **header bar**: the title, the camp select, the open adventure and sign-in, nothing more; resources are not shown there, because a camp will hold many kinds. The **facility menu**: an entry with an icon for every facility the camp has or may build, the same list the scene draws. The **stage**: the scene, filling the space the other regions leave it. The **content area**: always one panel, such as the heroes hall, the job board, the warehouse or a hero's card; the heroes hall when nothing else is chosen.
- **Decided.** Where there is room, the menu is on the left, the stage in the middle and the content area on the right, beside the scene and never over it. The side columns give way as the window narrows, not only the scene: the content area takes about a quarter of the window, between 17rem and 28rem, and the menu is an icon rail that shows its labels only where the wider menu costs the scene no scale step, with its icons at twice the size beside a scene at scale 3 or more. Where side by side would leave the scene below scale 2, on a tablet, a small window or a phone, the regions stack: the scene at the top, the page's width, then the menu as a row of icons, then the content area, which scrolls with the page.
- **Decided.** Where the player is, is the address's path: the camp, then its panel, `/camp/<location>/<facility>`, with a hero's card under the hall, `/camp/<location>/heroes-hall/heroes/<id>`. The browser's back returns to the last panel, a reload keeps it, a panel can be linked to, and the menu marks the hall while one of its heroes is open. A panel moves from a list to a detail and back, as the hall's roster does to a hero's card.
- **Decided.** A facility the camp has not built stands in the scene as an unfinished building, its level 0, and is in the menu like any other. Its panel says what it will do. **Open:** what building one takes, and the controls to build it.
- **Decided.** Resources are shown where they matter, not in a bar: the warehouse lists the camp's stock against its cap, and every cost or reward shows the camp's balance beside it.
- **Decided.** In battle the content area is reserved for the party and the controls instead of covering the scene, which scales into what is left; on a narrow screen they go below it.

## The adventure loop

- **Decided.** An adventure runs deterministically in the browser on a timestamped timeline and is submitted in one piece for verification. The game is not offline-first; the aim is to avoid a request per click.
- **Decided.** The timeline's clock counts whole milliseconds. Charge timers and turns run on that integer clock.
- **Decided.** The player can interject actions that may override a hero's next action. An override waits for the hero's next turn and applies if it is allowed at that moment; if it is not, the hero follows its own logic. Overrides go through the seeded run like everything else, so the timeline stays deterministic.
- **Decided.** No real-time gating. Players can pause, and can fast-forward, including through content they have automated.
- **Decided.** One unresolved adventure per player at a time.
  - It must be easy for the player to find, so they know it is in progress and can return to it.
  - If the browser closes, the adventure waits. On next sign-in the app checks for an unresolved adventure and picks it up, replaying the overrides so far with the client's own engine.
  - If the player never returns, it stays unresolved.
  - An adventure survives one game update and not two: the update before the current one stays able to verify it, so a player in the middle of an adventure when an update ships finishes and submits as if nothing happened. After a second update it is discarded, and the player is told (decision 0030, amending 0003).
  - A player who dislikes how a run is going must finish it to continue, or wait for the next update.
- **Decided.** A replay is what the server verified, played back. It is display only: any version of the game plays it, and it never needs the engine again.

## The battle

How an adventure plays out: the first cut, agreed 2026-10-21 (decision 0030). The shape is decided; the numbers are working assumptions in the engine's static content and are expected to change as the game is played.

- **Decided.** A job is an ordered list of stages: travel, fight, gather and arrive. An adventure runs them on one timeline, with health and cargo carried between stages. A tree is a resource node that a chopping ability "damages" into timber, and an ore vein one that mining turns into ore. A cart is a party member with health and no actions, for caravans later.
- **Decided.** Active time. Each unit has a charge timer that fills at its speed. When it fills, the unit picks the first usable action from its unit type's list, with the target the ability's rule chooses, warms up, resolves, and the timer resets. Nothing waits for the player: the battle plays itself, and the player watches, pauses, fast-forwards and interjects.
- **Decided.** One action list per unit type, fixed. The list is the unit's whole intelligence, and a better unit type is a better list, which is how progression automates what the player used to do by hand ("The business"). The player never edits a list.
- **Decided.** A marching order, not a grid. Each side has four lines, front, near, far and back; a line holds any number of units, with no order within it. A unit type has a home line, where it starts; the party pick places nobody. Reach is by line: an ability says which enemy lines it reaches from which of its own. When a side's front line empties, every unit on that side moves up a line, so the nearest occupied line is always the front. Stepping up is also an action, for the unit types whose list says so.
- **Working assumption.** The first unit types and monsters. Not very tactical, by design: a villager walks up and swings, because the player is not meant to keep villagers for long.

  | Unit | Home line | Its list, first usable action wins |
  | --- | --- | --- |
  | Villager | near | strike the closest in reach; chop a tree if one is there; mine an ore vein if one is there; move up |
  | Fighter | front | guard an ally below half health, if not already guarding; strike the closest |
  | Wolf | front | bite the closest; move up |
  | Bandit | near | strike the weakest in reach; move up |

- **Decided.** A guard lasts a few seconds. While it holds, hits aimed at the guarded ally land on the guard instead, and the guard does not start another until it expires (2026-10-21, Issue-110).
- **Decided.** Resource nodes, trees and ore veins, stand on the other side's lines and never act. A gathering ability reaches only its own kind of node and works by the unit's gathering stat. A regular attack can also hit a node, doing poor work for a poor yield, and is chosen only when nothing else in the unit's list is usable. A fighter alone with a tree therefore fells it, slowly, for little timber. A villager gathers both timber and ore, and a specialized gatherer does one of them better (2026-10-21, Issue-110).
- **Working assumption.** A unit's stats are health, speed (turns per ten seconds), damage and gathering. The numbers are in the engine's static content.
- **Decided.** Two kinds of override: forcing a unit's next action, which applies at its next turn if it is usable then and is dropped silently if not; and party orders, press on and retreat. Press on is the default. Retreat can be selected at any time and stays selected. During a fight it is attempted; when a stage completes with it selected, the party retreats for certain (2026-10-21, Issue-110; built in Issue-112).
- **Decided.** Retreat. Each job states its own retreat penalty. Retreating from a lumber run leaves with what was gathered and misses the better lumber further on; retreating from a caravan abandons the cargo.
- **Working assumption.** A retreat is attempted every so often until it succeeds, each attempt rolled with the adventure's seeded random number generator. Bonuses and items raise the chance, and the chance rises with each failed attempt, so bad luck alone cannot trap a party. The first numbers: an attempt every 2 s from the order, 30% at first and 20 points more after each failure, so the fifth is certain.
- **Decided.** Every fight and gather stage carries its own time limit, on the adventure's own clock, because some are expected to resolve faster than others. Reaching it ends the adventure as a retreat with the job's penalty. It is a deadlock kill switch, not a mechanic: the timer is shown only in its last stretch, and nothing is designed to be beaten against it.
- **Decided.** Mana and status effects are left out until the loop works.
- **Working assumption.** Millbrook's first jobs. "Wolves on the mill road": travel, fight two wolves, arrive; paid in cloth; a retreat forfeits the pay. "Timber from the near woods": travel, gather from trees, fight a wolf on the way back, arrive; the timber gathered and a small pay; a retreat keeps what was gathered. A party is one to four heroes. A job's pay is a reward from whoever posted it, so it need not be loot. The first numbers: the wolves job pays 10 cloth and 20 XP; the timber job carries 60 timber and pays 3 cloth and 15 XP.
- **Decided.** What an adventure yields (2026-10-21, Issue-112). Arriving pays the job's pay, the cargo and the job's XP to each surviving hero. A retreat, ordered or forced by a time limit, earns half the job's XP, and the job's penalty says whether the pay and the cargo are kept. A party that is all down keeps nothing. A hero sets out at full health, health carries from stage to stage, and a hero that falls sits out the rest of the job and is dead at its end. A gather stage ends when the party is loaded or the nodes are spent.
- **Decided.** The first battle shows no weapon and no effect sprites: a hero's act animation and the hit on its target carry it. The sprites of "How the game looks" come later.

## Locations and camps

- **Decided.** A location is one of a fixed set of places the game defines: villages, cities, strongholds and the like. Every player visits the same locations.
- **Decided.** A player unlocks a location and then has a camp there. A new player starts with one location unlocked and no heroes. **Open:** how further locations unlock; likely an explore or travel mission.
- **Decided.** A camp is one player's view of a location, and it is the main view for a signed-in player. One camp is on screen at a time, and the player switches between their unlocked camps at will with a select in the page's header bar. The header bar is thin and also holds the title, sign-in and the open adventure, so the player can always find it.
- **Decided.** A location has two kinds of facility. **Own facilities** belong to one player, who builds and upgrades them, so two players' camps at the same location can differ in which facilities they have and at what level. **Shared facilities** belong to the location and look the same to every player.
- **Decided.** Facilities are where the player acts: they open a facility by clicking it in the scene or by choosing it from the page's menu ("The page"). Most facilities offer missions, each its own kinds. A mine offers mining missions; a forest path, lumber runs; a caravan hub, caravans. The first is the **job board**, a shared facility offering general jobs, so a new player can set out without building anything.
- **Decided.** Heroes walk about the camp for flavor: some of the player's heroes at that location and some of other players' heroes there, never all of either. Clicking a hero shows who it is. Nothing is done through them. Another player's hero is one seen at the location in the last week, through being recruited there for now and through missions later; its card shows its name, unit type and level, never whose it is (decision 0029).
- **Decided.** A camp is a map of whole 16 px tiles, Millbrook's 400×225. The scene shows the map scaled up by the largest whole number of device pixels per art pixel at which its height and its middle, where every facility stands, fit the box; it fills the rest of the box with more ground around the map, or crops the map's bare edges where the box is a little narrow, so there are no bars and no stretching. It never scrolls. It sits below the header bar, which is part of the page and not of the scene (decision 0028, as amended by Issue-89 and Issue-95).
- **Decided.** Heroes in the camp are drawn at half the scene's scale, rounded up to a whole number, so they stand about a third of the hall's height rather than half, and their pixels stay square; never smaller than one CSS pixel per art pixel, so they can still be tapped on a phone. Battle keeps its own scale (decision 0028, as amended by Issue-99 and Issue-95).

## The heroes hall

- **Decided.** Every unlocked location has the player's own heroes hall, at level 1 or above. The hall is where heroes are recruited, and where the player views and manages their heroes at that location.
- **Decided.** A hero belongs to one camp at a time. The hall's level sets the number of active heroes the camp can hold. Living and dead heroes are both active. A retired hero is not: retiring is permanent, and a retired hero stays on the record with its history, like a dead one.
- **Decided.** Recruiting anyone needs a free slot. When no active hero at the location is alive, the next villager is free, so a player can never be locked out: a camp full of dead heroes retires one and recruits a villager for nothing.
- **Decided.** Each location lists the unit types that can be recruited there, each with the hall level it needs and its cost in resources. Common unit types are on many lists; some are found in one place only, such as the templar at a temple or the witch in a swamp. Every location offers the villager at hall level 1, which is what makes the free villager work everywhere.
- **Decided.** The first location is Millbrook, a quiet village. **Working assumption:** it recruits the villager and the fighter at hall level 1. The fighter's first level is easy to reach.
- **Decided.** A hero moves to another camp only as a passenger on a caravan, like cargo, possibly as a non-combatant. Its slot is held at both camps for the whole trip: at the start the destination must have a free slot; at settlement the hero lands at the destination if delivered and stays at home if not, and the other slot is released. A passenger who dies on the way arrives dead and counts there.

## Resources

- **Decided.** There is no currency. Everything is paid in resources, such as wood, iron and ore: a miner may cost iron, an archer wood. If gold exists, it is one more resource.
- **Decided.** Resources are held per location: each camp has its own stock. They move between locations only by caravan, which is what makes supplying a remote camp a job of its own.
- **Decided.** Each camp's warehouse caps the stock of each resource by its level. Every unlocked location has one at level 1 or above, like the heroes hall. A credit that would pass the cap stops at it and the rest is lost; the result says how much. Before setting out, the player is shown how much room the destination has.
- **Decided.** A player's own facilities, their levels, their resources and their heroes' private details are owner-only data, which field-level authorization protects.
- **Open.** The hall's and the warehouse's caps per level, recruitment costs, and which unit types each location offers. The numbers live in the game's static content and start as working assumptions: a level-1 hall holds 4 heroes, a level-1 warehouse 100 of each resource.

## Live location channel

- **Decided.** Canned messages and actions rather than free text, for example one hero waving at another on the same screen.

## Cooperation

- **Decided (direction).** Players should eventually interact beyond viewing each other's actions. The form is open.
- **Parked suggestion.** A shared project at a location with a fixed requirement and a per-player cap, where everyone benefits on completion.

## Open

- Which locations exist, and how each is unlocked.
- What settlement credits besides XP, a job's pay, what was gathered and returned consumables.
- The names job and adventure.
