# 0057: The play clock pauses while an action is animated, and the whole of an action plays as it resolves

- **Status:** Decided; the share of an animation the clock waits for, and a flight's length, are working assumptions set by looking.
- **Date:** 2026-11-20
- **Settles:** Issue-335: battle animations ran over the top of each other. Whose pause it is, the engine's or the page's; how much of an animation the clock waits for; when an action's animation plays, which reverses the timing of Issue-130's swing and of decision 0052's projectile. The owner's calls, made in the Issue-335 session on 2026-11-19 and 2026-11-20, each after watching the one before.

## Decision

**The adventure's clock pauses while an action is animated.** When an action resolves, the page holds the clock until the action's animation is over: the actor's swing, a projectile's flight, the ability's effect, the target's hit and a fall. It waits for the whole of it, so one action is seen from its first frame to its last before the next thing happens. The events of one frame pause the clock once, for the longest of what they begin and not for the sum. An entry in the same frame takes the pause's place, and a page with no scene pauses for nothing.

**The pause is the page's, not the engine's.** `Play` already held the clock at an entry while the scene brought everyone on (Issue-15); this is the same hold. The engine, its events and the timeline do not change, so verification, the override log and every stored replay are what they were, and a replay pauses as a run does. A stage's time limit and its countdown are the engine's time and do not move. The pause is measured in presentation time, the wall clock times the speed, so it shortens at 2× and 4× as the animations do, and it does not run down while the player has paused.

**The whole of an action's animation plays as the action resolves, in one piece.** An action is one instant of the game's clock, and everything it shows belongs to that instant: the wind-up, the blow or the release, a projectile's flight, and what the action does to whoever it reached. The act and its weapon's swing play from their first frames; each waits on its hold frame until both are there, which is the blow or the release; the rest of the swing follows. A projectile is on the bow's string through the draw, leaves at the release and flies to its target. The ability's effect, the target's hit, a fall and the target's health bar in the scene begin at the blow, or where the projectile lands. Everything is on the presentation clock, so nothing in it stops while the adventure's clock stands.

**Nothing of an action is drawn before it happens.** While an action warms up, its unit stands as it stood. The warmup is the engine's time between a turn and its action; the page no longer fills it with the wind-up. This reverses Issue-130's swing, which began at the declaration and held at the blow until the action resolved, and decision 0052's projectile, which was let go partway through the warmup and landed as the action resolved.

**A shot keeps the lengths decision 0052 gave it.** Its wind-up is the frames before the hold, 450 ms for the bow and 270 ms for the goblin's throw, and its flight is what the warmup leaves after the wind-up, 250 ms for the arrow and 330 ms for the rock, so the wind-up and the flight together still last as long as the engine warms the action up. The path, its arc, the arrow on the nock while the bow is drawn and the projectile that is dropped when its target is gone stand as decided there. One thing more changes: the projectile flies at whoever took the hit, a guard that stepped in and not the ally it covered, because by the time it is let go the engine has said who that is.

**What it costs.** A fight takes longer on the wall clock by the length of its animations. Estimated before the work from 20 seeds a job, for the hit, the effect and the fall alone: a lone villager's "Pick up sticks" about 41% longer, two villagers' timber run 82%, three villagers' ore run 116%, and a fighter and two villagers against the wolves 148%. The swing before the blow adds up to 180 ms to each action, and a shot adds its wind-up and flight, 600 to 700 ms. The owner's call: a longer pause is fine.

## Considered and not chosen

**A pause in the engine.** Stopping every timer in the engine while an action is animated is the same thing as holding the clock in the page, with a new timeline shape and every stored replay to migrate for it. Stopping only some timers would change who acts first and so how a fight ends.

**Half of each animation.** The first shape, agreed on 2026-11-19 as a share that is easy to change: the clock waited for half of the longest clip. The owner watched it and the animations still ran over each other.

**The whole animation, with the swing still drawn from the adventure's clock.** The second shape. The actor's swing stood at its blow for the whole pause and finished only when the clock ran again, and a unit warming up, or an arrow in flight, froze while another action was animated. The owner's call: the animation being performed does not pause.

**Keeping decision 0052's flight in the warmup.** An arrow let go during its warmup is in the air while the clock may pause for someone else's action, and hangs there. Flying it on the presentation clock instead would land it before its damage. The owner's question settled it: the strike is part of the one action, at one instant of the game's clock, so its flight belongs in that action's pause.

**The wind-up through the warmup, waiting on a ready frame.** The third shape, built and watched: a unit played its wind-up from the declaration and waited, a bow at its full draw and a goblin with its arm raised, and the release, the flight and the strike played as the action resolved. The throw's motion and its rock were then apart by a wait, a long one when another action's pause fell between them, so the flight read as put off. The owner's call: not what we want. Playing the wind-up with the rest, as the action resolves, puts the motion and the flight together.

**Finishing a weapon's swing after its wielder's act is over.** A swing can have more frames after its blow than the act has; the weapon is still shown only while its wielder acts, as before.

## Where it is described

`docs/design/battle.md`, "The clock pauses while an action is animated". `docs/process/assets.md`, rules 33 and 35. `docs/architecture/adventure-loop.md`, "The loop", the item built by Issue-335. The hold in `packages/client/src/app/adventure/play.ts` and `battle/clip-hold.ts`; the frames of an act and the flight in `battle/action-sprites.ts`; the drawing, the share `HOLD_SHARE` and what is waited for in `battle/battle-scene.ts`.
