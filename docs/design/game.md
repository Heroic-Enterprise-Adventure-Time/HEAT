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

- **Decided.** Appearance is cosmetic. At recruitment a hero is given a sprite set, drawn at random from the sets its unit type allows, and a name, drawn at random from a fixed list. A set may serve more than one unit type. The hero keeps both for good. There is no renaming, so no text a player wrote is ever shown to another player, and the game needs no moderation.
- **Decided.** Advancement. A hero earns XP in adventures, credited at settlement, and XP brings levels. Each level offers a choice between small, fixed stat boosts from the unit type's list, so two heroes of the same unit type and level can differ.
- **Decided (direction).** Advanced classes. A hero may later move to an advanced class, which swaps its unit type and starts it again at level one. A temporary dip in strength is acceptable; an advanced class at its top level beats its base class at its top level.
- **Decided.** Weapons. Each unit type uses one weapon kind and no other: rangers use bows, knights use swords. A weapon changes numbers, never abilities. Weapons are crafted from materials; a rare weapon needs at least one rare material.
- **Working assumption.** A weapon lasts a number of fights, a fight being one battle stage. A hero whose weapon breaks fights on with its unit type's unarmed numbers, so a broken weapon never strands a party.
- **Decided.** Death. A hero can die for good. Bringing a dead hero back always costs a resource or a consumable and needs a facility. Cheaper forms carry a penalty: lost XP, a lost level, or time to recover. The cheapest form comes early in the camp's progression, so losing a villager on a boss run hurts without being frustrating. A dead hero stays on the record with its history.
- **Working assumption.** Consumables. Crafted from materials and taken on an adventure in a small pack chosen at the start, which goes into the adventure's snapshot. Each is used through an override: party-wide heals, shields and bonuses that let a player spend their way through a hard mission. Unused consumables return to the player's holdings at settlement.
- **Decided.** History. Each hero keeps a record of what it has done, such as adventures survived, monsters defeated and goods delivered.
- **Open.** The stat boosts each unit type offers, the XP curve, which advanced classes exist, and the costs of resurrection, weapons and consumables.

## How the game looks

The rules for making a hero's sprite set are `docs/process/assets.md`, rules 8 to 13; this section says what the player sees.

- **Decided.** One view for camp and battle: low top-down, about 20 degrees, the classic 3/4 view of an RPG town. Battle arranges the same sprites so that it reads as side-on.
- **Decided.** An NES-era look, with Final Fantasy 1 as the reference: warm, earthy colours, a black outline, few colours per sprite, characters 32 px tall.
- **Decided.** Characters, monsters, environment and UI share one theme. Ranger 01 (`art/heroes/ranger-01/`) is the baseline.
- **Decided.** Characters hold nothing. Every action, whatever the ability, is the hero's act animation, a three-frame lead jab whose middle frame is held for as long as the action lasts, played with two separate sprites: the weapon, which appears beside the hero, and the ability's effect, such as a slash, an arrow or a spell. A weapon's one sprite is also its icon in the inventory. Its motion is drawn as animation frames, not rotated in code, because rotated pixel art blurs at any angle but a right angle.
- **Decided.** A sprite set's animations are walk, stance, act, hit and down. A hero standing outside battle is its still frame; there is no idle animation.

## The adventure loop

- **Decided.** An adventure runs deterministically in the browser on a timestamped timeline and is submitted in one piece for verification. The game is not offline-first; the aim is to avoid a request per click.
- **Decided.** The timeline's clock counts whole milliseconds. Charge timers and turns run on that integer clock.
- **Decided.** The player can interject actions that may override a hero's next action. An override waits for the hero's next turn and applies if it is allowed at that moment; if it is not, the hero follows its own logic. Overrides go through the seeded run like everything else, so the timeline stays deterministic.
- **Decided.** No real-time gating. Players can pause, and can fast-forward, including through content they have automated.
- **Decided.** One unresolved adventure per player at a time.
  - It must be easy for the player to find, so they know it is in progress and can return to it.
  - If the browser closes, the adventure waits. On next sign-in the app checks for an unresolved adventure and picks it up.
  - If the player never returns, it stays unresolved.
  - If a game update ships before it is resolved, it is discarded.
  - A player who dislikes how a run is going must finish it to continue, or wait for the next update.

## The battle

How an adventure plays out. Everything in this section is expected to change as the game is played; it is written down so that there is something to change.

- **Working assumption.** A job is an ordered list of stages (travel, fight, gather, arrive). An adventure runs them on one timeline, with health and cargo carried between stages. A cart is a party member with health and no actions. A tree is a resource that a chopping ability "damages" into lumber.
- **Open.** Unit types and abilities. A first cut to react to: a fighter who holds the front, a ranger who hits from behind, and a laborer who chops and carries but fights badly, with mana and status effects left out until the loop works.
- **Working assumption.** There are two kinds of override: forcing a unit's next action, and party orders such as press on or retreat.
- **Decided.** Retreat. Each job states its own retreat penalty. Retreating from a lumber run leaves with what was gathered and misses the better lumber further on; retreating from a caravan abandons the cargo.
- **Working assumption.** A retreat is attempted every so often until it succeeds, each attempt rolled with the adventure's seeded random number generator. Bonuses and items raise the chance, and the chance rises with each failed attempt, so bad luck alone cannot trap a party.

## Locations and camps

- **Decided.** A location is one of a fixed set of places the game defines: villages, cities, strongholds and the like. Every player visits the same locations.
- **Decided.** A player unlocks a location and then has a camp there. A new player starts with one location unlocked and no heroes. **Open:** how further locations unlock; likely an explore or travel mission.
- **Decided.** A camp is one player's view of a location, and it is the main view for a signed-in player. One camp is on screen at a time, and the player switches between their unlocked camps at will with a select in the page's header bar. The header bar is thin and also holds the title, sign-in and the open adventure, so the player can always find it.
- **Decided.** A location has two kinds of facility. **Own facilities** belong to one player, who builds and upgrades them, so two players' camps at the same location can differ in which facilities they have and at what level. **Shared facilities** belong to the location and look the same to every player.
- **Decided.** Facilities are where the player acts: they click a facility to use it. Most facilities offer missions, each its own kinds. A mine offers mining missions; a forest path, lumber runs; a caravan hub, caravans. The first is the **job board**, a shared facility offering general jobs, so a new player can set out without building anything.
- **Decided.** Heroes walk about the camp for flavor: some of the player's heroes at that location and some of other players' heroes there, never all of either. Clicking a hero shows who it is. Nothing is done through them.
- **Working assumption.** The scene is drawn at 320×180 and scaled up by whole numbers, below the header bar, which is part of the page and not of the scene.

## The heroes hall

- **Decided.** Every unlocked location has the player's own heroes hall, at level 1 or above. The hall is where heroes are recruited, and where the player views and manages their heroes at that location.
- **Decided.** A hero belongs to one camp at a time. The hall's level sets the number of active heroes the camp can hold. Living and dead heroes are both active. A retired hero is not: retiring is permanent, and a retired hero stays on the record with its history, like a dead one.
- **Decided.** Recruiting anyone needs a free slot. When no active hero at the location is alive, the next villager is free, so a player can never be locked out: a camp full of dead heroes retires one and recruits a villager for nothing.
- **Decided.** Each location lists the unit types that can be recruited there, each with the hall level it needs and its cost in resources. Common unit types are on many lists; some are found in one place only, such as the templar at a temple or the witch in a swamp. Every location offers the villager at hall level 1, which is what makes the free villager work everywhere.
- **Working assumption.** The first location recruits the villager and the fighter at hall level 1. The fighter's first level is easy to reach.
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

- Whether to keep mana and status effects, and whether the party is a marching order instead of a grid.
- Discrete stages (assumed) versus one continuous track with positions.
- Which locations exist, and how each is unlocked.
- Rewards, and what settlement credits besides XP and returned consumables.
- The names job and adventure.
