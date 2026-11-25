/**
 * The arithmetic of the play clock's hold for a battle's clips (battle.md,
 * "The clock pauses while an action is animated"; Issue-335), apart from
 * the renderer so that it is tested without one. An action's swing, a
 * projectile's flight, the hit, the ability's effect and a fall each play
 * on the presentation clock, the wall clock times the speed, and the
 * adventure's clock waits for a share of the longest that one frame's
 * events start, the whole of it by the scene's `HOLD_SHARE`, so that one
 * action is animated to its end before the next thing happens (decision
 * 0057). The hold is the page's alone: the engine, its events and the
 * timeline know nothing of it, so a run, its verification and its replay are
 * what they were.
 */

/**
 * How long the clock waits for the clips one frame's events start, each
 * given by its length: `share` of the longest of them, not of their sum, and
 * nothing for a frame that starts none. In presentation time, as the
 * lengths are.
 */
export function clipHold(clipsMs: readonly number[], share: number): number {
  return share * Math.max(0, ...clipsMs);
}

/**
 * A hold `ms` of presentation time later: what is left of it, and what is
 * left of the time once it is over, which moves the run on, so that a hold
 * ending inside a frame costs the run none of that frame.
 */
export function spendHold(held: number, ms: number): { readonly held: number; readonly left: number } {
  return { held: Math.max(0, held - ms), left: Math.max(0, ms - held) };
}
