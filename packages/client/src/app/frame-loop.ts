import { InjectionToken } from '@angular/core';

/** Calls `onFrame` with the wall-clock milliseconds since the last frame until stopped; a test provides one it drives by hand. */
export type FrameLoop = (onFrame: (elapsedMs: number) => void) => () => void;

/** The longest step one frame may take, so a tab coming back from the background does not leap ahead. Exported for the specs' frame loop, which gives the page the frames the browser would (typescript.md, rule 24). */
export const MAX_FRAME_MS = 250;

/**
 * The browser's frames, as the page's frame loop gives them: a function of
 * its own so that a spec runs it against frames it hands out. A loop stopped
 * from inside its own frame, as a count is when its last amount is whole,
 * has no frame left to cancel, so it is remembered as stopped and asks for
 * no more (the review of PR-443).
 */
export const browserFrames: FrameLoop = (onFrame) => {
  let last: number | null = null;
  let stopped = false;
  let id = requestAnimationFrame(function frame(now) {
    if (last !== null) onFrame(Math.min(now - last, MAX_FRAME_MS));
    last = now;
    if (!stopped) id = requestAnimationFrame(frame);
  });
  return () => {
    stopped = true;
    cancelAnimationFrame(id);
  };
};

/**
 * The page's frame loop, for whatever the page moves frame by frame: a battle
 * (`adventure/battle-view.ts`) and an amount counted up
 * (`primitives/gains.ts`). It is a token so that a spec steps the frames by
 * hand (angular.md, rules 2 and 23); each caller has a loop of its own, and
 * stops it with what the call answers, from anywhere.
 */
export const FRAME_LOOP = new InjectionToken<FrameLoop>('heat.frames', { providedIn: 'root', factory: () => browserFrames });
