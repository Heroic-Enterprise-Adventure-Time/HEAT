# 0057: The play clock pauses while an action is animated, and a shot's flight is part of its action

- **Status:** Decided; the share of an animation the clock waits for, and a flight's length, are working assumptions set by looking.
- **Date:** 2026-11-20
- **Settles:** Issue-335: battle animations ran over the top of each other. Whose pause it is, the engine's or the page's; how much of an animation the clock waits for; what happens to the animation of the action under way; and when a projectile flies, which reverses the timing of decision 0052. The owner's calls, made in the Issue-335 session on 2026-11-19 and 2026-11-20, each after watching the one before on the issue's stack.

## Decision

**The adventure's clock pauses while an action is animated.** When an action resolves, the page holds the clock until what the action began is over: the rest of the actor's swing, a projectile's release and flight, the ability's effect, the target's hit and a fall. It waits for the whole of the longest of them, so one action is seen to its end before the next thing happens. The events of one frame pause the clock once, for the longest and not for their sum. An entry in the same frame takes the pause's place, and a page with no scene pauses for nothing.

**The pause is the page's, not the engine's.** `Play` already held the clock at an entry while the scene brought everyone on (Issue-15); this is the same hold. The engine, its events and the timeline do not change, so verification, the override log and every stored replay are what they were, and a replay pauses as a run does. A stage's time limit and its countdown are the engine's time and do not move. The pause is measured in presentation time, the wall clock times the speed, so it shortens at 2× and 4× as the animations do, and it does not run down while the player has paused.

**Nothing a unit is doing stops when the clock does.** Everything the scene animates plays on the presentation clock. A unit that has declared an action plays its act, and its weapon's swing, up to a ready frame and waits there until the action resolves; the rest plays from that moment. The ready frame is the act's hold frame and the weapon's, as before, and for a bow its full draw, the frame before its hold where the string is furthest back, read from the nocks its provenance records.

**A shot's release, flight and strike are part of its action, and happen as it resolves.** This reverses decision 0052's timing, which let the projectile go partway through the warmup and landed it as the action resolved, so that a warmup was "its wind-up and its flight together". Now the warmup shows the wind-up alone: the bow drawn and held, the arrow on its string; the goblin's arm raised. As the action resolves the bow looses, the arrow leaves as the bow reaches its hold frame and flies to its target, and where it lands the impact, the hit and a fall begin. The flight keeps the length decision 0052 gave it, what was left of the warmup after the wind-up: 250 ms for the arrow and 330 ms for the rock. The target's health bar in the scene shows the hit as the projectile lands.

- The rest of decision 0052's projectile stands: the straight path with the arc of the tool's own path, no rotation, the arrow on the nock while the bow is drawn, the flight at whoever the action was declared at with the impact on whoever took the hit, and a projectile dropped when its target is gone.
- A melee action is unchanged in what it shows: the swing reaches its blow during the warmup and waits there, and the rest of it, with the effect and the hit, plays as the action resolves.
- An action declared and never resolved, because its fight ended first, is dropped at the fight's end.

**What it costs.** A fight takes longer on the wall clock by the length of its animations. Estimated before the work from 20 seeds a job, for the hit, the effect and the fall alone: a lone villager's "Pick up sticks" about 41% longer, two villagers' timber run 82%, three villagers' ore run 116%, and a fighter and two villagers against the wolves 148%. A shot adds its release and flight to that. The owner's call: a longer pause is fine.

## Considered and not chosen

**A pause in the engine.** Stopping every timer in the engine while an action is animated is the same thing as holding the clock in the page, with a new timeline shape and every stored replay to migrate for it. Stopping only some timers would change who acts first and so how a fight ends.

**Half of each animation.** The first shape, agreed on 2026-11-19 as a share that is easy to change: the clock waited for half of the longest clip. The owner watched it and the animations still ran over each other.

**The whole animation, with the swing still drawn from the adventure's clock.** The second shape. The actor's swing stood at its blow for the whole pause and finished only when the clock ran again, and a unit warming up, or an arrow in flight, froze while another action was animated. The owner's call: the animation being performed does not pause.

**Keeping decision 0052's flight in the warmup.** An arrow let go during its warmup is in the air while the clock may pause for someone else's action, and hangs there. Flying it on the presentation clock instead would land it before its damage. The owner's question settled it: the strike is part of the one action, at one instant of the game's clock, so its flight belongs in that action's pause.

**A recorded full-draw frame in the bow's provenance.** The frame is the one where the string is furthest back, which the recorded nocks already say, so it is read from them. A field of its own would have changed the art build, the sheet's schema and a published file for a number the data holds.

**Finishing a weapon's swing after its wielder's act is over.** A swing can have more frames after its blow than the act has; the weapon is still shown only while its wielder acts, as before, so that melee looks as it did. Left for the owner to see first.

## Where it is described

`docs/design/game.md`, "The battle". `docs/process/assets.md`, rules 33 and 35. `docs/architecture/adventure-loop.md`, "The loop", the item built by Issue-335. The hold in `packages/client/src/app/adventure/play.ts` and `battle/clip-hold.ts`; the frames of an act, the full draw and the flight in `battle/action-sprites.ts`; the drawing, the share `HOLD_SHARE` and what is waited for in `battle/battle-scene.ts`.
