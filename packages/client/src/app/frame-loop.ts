import { InjectionToken } from '@angular/core';

/** Calls `onFrame` with the wall-clock milliseconds since the last frame until stopped; a test provides one it drives by hand. */
export type FrameLoop = (onFrame: (elapsedMs: number) => void) => () => void;

/** The longest step one frame may take, so a tab coming back from the background does not leap ahead. Exported for the specs' frame loop, which gives the page the frames the browser would (typescript.md, rule 24). */
export const MAX_FRAME_MS = 250;

/**
 * The browser's frames, for whatever the page moves frame by frame: a battle
 * (`adventure/battle-view.ts`) and an amount counted up
 * (`primitives/gains.ts`). It is a token so that a spec steps the frames by
 * hand (angular.md, rules 2 and 23); each caller has a loop of its own, and
 * stops it with what the call answers.
 */
export const FRAME_LOOP = new InjectionToken<FrameLoop>('heat.frames', {
  providedIn: 'root',
  factory: () => (onFrame) => {
    let last: number | null = null;
    let id = requestAnimationFrame(function frame(now) {
      if (last !== null) onFrame(Math.min(now - last, MAX_FRAME_MS));
      last = now;
      id = requestAnimationFrame(frame);
    });
    return () => { cancelAnimationFrame(id); };
  },
});
