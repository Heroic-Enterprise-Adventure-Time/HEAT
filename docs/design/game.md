# The game

What the player does in HEAT. How the system delivers it is in `docs/architecture/overview.md`. Nothing described here is built yet unless it says so.

Each item carries a status. **Decided** items are settled by the project owner. **Working assumption** items were proposed during design and not yet objected to: build on them, but expect them to be revisited. **Open** items are not yet answered.

## The business

- **Decided.** The player runs an adventuring business.
- **Decided.** Heroes are close to unit types: every ranger is the same as every other ranger. Adding a unit type should be simple.
- **Decided (direction, if time allows).** Progression means gaining unit types that get more done with less intervention, automating what the player used to do by hand and freeing them for the next problem.
- **Decided.** A **job** is the template; an **adventure** is one run of a job. The names may change.
- **Decided.** Jobs are more than battles. Examples: take a cart of goods from one settlement to another; go into the forest, chop lumber and return safely; fight through a hundred goblins and kill their king. An adventure progresses linearly, doing things along the way.
- **Working assumption.** A job is an ordered list of stages (travel, fight, gather, arrive). An adventure runs them on one timeline, with health and cargo carried between stages. A cart is a party member with health and no actions. A tree is a resource that a chopping ability "damages" into lumber.
- **Working assumption.** An outcome is richer than win or lose: how far the party got, what it gathered or delivered, who was lost.
- **Open.** Unit types and abilities. A first cut to react to: a fighter who holds the front, a ranger who hits from behind, and a laborer who chops and carries but fights badly, with mana and status effects left out until the loop works.

## The adventure loop

- **Decided.** An adventure runs deterministically in the browser on a timestamped timeline and is submitted in one piece for verification. The game is not offline-first; the aim is to avoid a request per click.
- **Decided.** The player can interject actions that may override a hero's next action. An override waits for the hero's next turn and applies if it is allowed at that moment.
- **Decided.** No real-time gating. Players can pause, and can fast-forward, including through content they have automated.
- **Decided.** One unresolved adventure per player at a time.
  - It must be easy for the player to find, so they know it is in progress and can return to it.
  - If the browser closes, the adventure waits. On next sign-in the app checks for an unresolved adventure and picks it up.
  - If the player never returns, it stays unresolved.
  - If a game update ships before it is resolved, it is discarded.
  - A player who dislikes how a run is going must finish it to continue, or wait for the next update.
- **Working assumption.** There are two kinds of override: forcing a unit's next action, and party orders such as press on or turn back.

## Private holdings

- **Decided.** Each player has a per-location asset store: acquired materials, and facilities built or acquired that grant a bonus or access. All of it is private. This is the owner-only data that field-level authorization protects.

## Live location channel

- **Decided.** Canned messages and actions rather than free text, for example one hero waving at another on the same screen.

## Cooperation

- **Decided (direction).** Players should eventually interact beyond viewing each other's actions. The form is open.
- **Parked suggestion.** A shared project at a location with a fixed requirement and a per-player cap, where everyone benefits on completion.

## Open

- Whether to keep mana and status effects, and whether the party is a marching order instead of a grid.
- Discrete stages (assumed) versus one continuous track with positions.
- Locations: how many, and what "at a location" means for a player and a hero.
- Rewards, and what settlement credits.
- The names job and adventure.
