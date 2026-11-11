# 0052: Ranged units: an attack that reaches every line, a shot that hits a node last, and a projectile let go at the hold frame

- **Status:** Decided; the numbers are working assumptions in the engine's static content.
- **Date:** 2026-11-11
- **Settles:** Issue-286: what a ranged unit is, on each side; whether a ranged attack ever hits a resource node; where a ranger is recruited and for what; the first job with a mixed stage; and when a projectile leaves and lands, which the asset rules said two ways. The picture was the owner's in the step 3 design session (Issue-282); the numbers and the timing were agreed at the start of the Issue-286 session.

## Decision

**A ranged attack reaches every line of the other side from every line of its own.** Melee reaches the front line only (decision 0030), so a monster standing behind resource nodes is out of its reach until the nodes fall and its side moves up. Nothing else about the battle changes: a ranged attack is a `damage` ability with a wider reach and a longer warmup, chosen from the unit's one list like any other.

**The ranger**, a hero unit type: home line far, 26 health, speed 10, damage 6, no gather rating, and a list of one action, shoot the closest. **The goblin rock thrower**, a monster: home line far, 12 health, speed 8, damage 5, and a list of one action, throw a rock at the closest. The goblin is fragile and hits hard; "closest" lands its rocks on whoever is at the front, which is whoever is digging, and leaves a ranger alone while anyone stands in front of it. Shoot warms up for 700 ms and the throw for 600 ms.

**A shot hits a node only when nothing else is in reach, and wastes what it takes.** This is decision 0051's targeting rule as it stands, with no exception for a ranged attack: the ranger shoots every monster first, then the nodes, and with no gather rating its hits harvest nothing. The owner's call: "a couple shots on rocks wastes a little, but not a lot."

**A ranger is recruited at Millbrook with a level 2 heroes hall, for 40 timber and 10 cloth.** It is the first unit type a hall's level gates, and one more step of the first progression (decision 0031): the wolves job's cloth pays for the hall's second level, 80 timber and 20 cloth, and then for the ranger.

**The first mixed stage is the mine's second job, "Goblins in the old workings":** travel, a gather stage of three ore veins with two goblin rock throwers behind them, limit 120 s, arrive. No pay, 25 XP, and a retreat keeps the ore gathered. Its ceiling, 90 ore, fits a level-1 warehouse.

**A projectile is let go at the hold frame and lands as the action resolves.** `docs/process/assets.md` rule 33 held a weapon on its hold frame until the action resolved, and rule 35 flew the projectile over the whole warmup; for a bow, whose hold frame is the release, the arrow would have been in the air while the string was still being drawn. One rule now: the actor's weapon, or its act where it has no weapon, plays up to its hold frame; the projectile leaves then, from the bow's nock or the hand, and flies for what is left of the warmup; its impact plays on whoever the hit landed on as the action resolves, as any effect does. So a ranged ability's warmup is its wind-up and its flight together.

- The bow's frames before its hold have their own lengths, recorded in its provenance as `frameMs`: the draw at the act's 90 ms a frame and the release, frames 4 and 5, at 45 ms, on the owner's note of 2026-11-10. Its hold begins at 450 ms and the arrow flies for 250 ms.
- While the bow is drawn the arrow's sprite is shown on the string, its tail on the frame's nock (the owner's note of the same day).
- The goblin's throw reaches its hold frame, the arm at the release, at 270 ms, and the rock flies for 330 ms.
- A projectile's path is a straight line from where it is let go to where the effects tool drew it on its target, lifted in the middle by the arc of the tool's own path, kept as a share of the distance: none for the arrow, an eighth for the rock.

**The engine's events do not change.** The scene draws the flight from `action-declared`, which already carries when the action resolves, and the impact from `action-resolved`. Both timeline schema versions stay at 2, and a stored replay draws its projectiles from the same events a live run does.

**Checked with the engine** (`replay`, 1,000 seeds per party, no overrides):

| Job | Party | Outcome | Deaths per run | Brings home |
| --- | --- | --- | --- | --- |
| Goblins in the old workings | 1, 2 or 3 villagers | defeat 1,000 | all | nothing |
| Goblins in the old workings | 4 villagers | complete 1,000 | 0.95 | 60 ore |
| Goblins in the old workings | fighter + villager | defeat 1,000 | 2 | nothing |
| Goblins in the old workings | fighter + 2 villagers | complete 862, defeat 138 | 1.24 | 0 to 36 ore |
| Goblins in the old workings | ranger | complete 982, defeat 18 | 0.02 | nothing |
| Goblins in the old workings | ranger + villager | complete 1,000 | 0.03 | 6 to 33 ore |
| Goblins in the old workings | ranger + 2 villagers | complete 1,000 | 0 | 34 to 47 ore |
| Goblins in the old workings | 2 rangers + 2 villagers | complete 1,000 | 0 | 26 to 36 ore |
| Goblins in the old workings | ranger + fighter + villager | complete 1,000 | 0 | 13 to 20 ore |
| Goblins in the old workings | ranger + fighter + 2 villagers | complete 1,000 | 0 | 21 to 28 ore |
| Wolves on the mill road | ranger | defeat 1,000 | 1 | nothing |
| Wolves on the mill road | ranger + villager | complete 564, defeat 436 | 1.44 | the pay when complete |
| Wolves on the mill road | ranger + fighter | complete 1,000 | 0 | the pay |
| Wolves on the mill road | 2 rangers | complete 1,000 | 0.11 | the pay |
| Timber from the near woods | ranger + villager | complete 1,000 | 0 | 23 to 28 timber |
| Timber from the near woods | ranger + 2 villagers | complete 1,000 | 0 | 32 to 37 timber |
| Ore from the hill | ranger + villager | complete 1,000 | 0 | 16 to 19 ore |
| Ore from the hill | ranger + 2 villagers | complete 1,000 | 0 | 22 to 25 ore |
| Pick up sticks | ranger + villager | complete 1,000 | 0 | 12 timber |

Four villagers can force the goblins job and lose one of them on most runs; a ranger with two villagers clears it with no death. The longest completed run of it is 47 s, a ranger alone shooting three veins down, against the limit of 120 s. On a stage of nodes alone a ranger wastes as a fighter does, from the first turn: it is not worth bringing on a plain resource run. The engine's tests replay the goblins job over 500 seeds per party.

## Considered and not chosen

**A ranged attack that never targets a node.** The agent's recommendation: an arrow does nothing to a rock, the ranger would be the clean answer to the stage, 60 ore with two villagers against 34 to 47, and a second ranger would cost nothing. It needs a rule of its own in the targeting, and a ranger with no gatherer could not finish a stage that has nodes, which would end at its time limit as a retreat. The owner chose the rule as it stands: the waste is small, and no new rule is needed.

**The ranger at hall level 1.** Recruitable as soon as it can be paid for, and quicker to reach on a test stack. The hall's level would still gate nothing, and the progression would have no step after the fighter.

**Three goblins, or a goblin of 16 health.** Tried on a draft of the job with two veins, 500 seeds a party. Three goblins of 16 health and damage 3 killed two of a ranger's party of three on a run and defeated it on 7 seeds, so the job would need two rangers; two such goblins let three villagers through with a death on 4 runs in 100, so the ranger answers nothing.

**"Weakest" for the goblin's target.** On the same draft it killed one of four villagers on nearly every run, hunting whoever was wounded wherever they stood; "closest" is the picture, rocks at whoever digs.

**Flying the projectile over the whole warmup,** rule 35 as it was written. The arrow would leave the bow before the string was drawn. **A new engine event for the release.** The timeline would change shape for something the scene derives from two times it already has, and stored replays would need the schema version moved.

**Rotating the projectile along its path.** Rotated pixel art blurs at any angle but a right one (game.md, "How the game looks"); the arrow flies level between lines of one height, and the rock's own frames turn it.

## Where it is described

`docs/design/game.md`, "The battle" and "The heroes hall". `docs/process/assets.md`, rules 33 and 35. `docs/architecture/adventure-loop.md`, "The loop", the item built by Issue-286. The abilities, the two profiles, the recruit and the job are in `packages/engine/src/content.ts`; the flight's arithmetic in `packages/client/src/app/adventure/battle/action-sprites.ts` and its drawing in `battle-scene.ts`; the bow's frame lengths and nocks in `art/weapons/bow-01/provenance.json`.
