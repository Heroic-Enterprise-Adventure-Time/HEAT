import { InjectionToken } from '@angular/core';

/**
 * Whether the player has asked their system for less motion
 * (`prefers-reduced-motion: reduce`), read when it is asked, for motion the
 * page drives frame by frame: such motion is not begun, and its end state is
 * shown at once (angular.md, rule 23). Motion written in a stylesheet reads
 * the same setting in a media query. A token, so that a spec says which
 * player it is (angular.md, rule 2).
 */
export const REDUCED_MOTION = new InjectionToken<() => boolean>('heat.reduced-motion', {
  providedIn: 'root',
  // jsdom, where the specs run, has the name matchMedia but no function behind it, though the DOM types say every window has one.
  factory: () => () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
});
