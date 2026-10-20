import { SCENE_HEIGHT, SCENE_WIDTH } from './scene/layout';

/**
 * The arithmetic of the page around the scene (Issue-89): the scene's whole
 * number scale, and whether the facility menu has room for its labels. Plain
 * functions of the viewport, so they are tested without a browser; the CSS
 * lays the regions out and these say what fits.
 */

/** The header bar's height in CSS pixels: 2.25rem. */
export const HEADER_PX = 36;
/** The facility menu as an icon rail: 3.5rem. */
export const RAIL_PX = 56;
/** The facility menu with its labels: 12.5rem. */
export const LABELLED_PX = 200;

/** The largest whole number that fits the scene in the space, never below 1. */
export function sceneScale(width: number, height: number): number {
  return Math.max(1, Math.floor(Math.min(width / SCENE_WIDTH, height / SCENE_HEIGHT)));
}

/** Landscape lays the menu, the scene and the content area side by side; anything narrower stacks them. Matches the CSS's `min-aspect-ratio: 4/3`. */
export function isLandscape(width: number, height: number): boolean {
  return width * 3 >= height * 4;
}

/**
 * Whether the menu shows its labels: only in landscape, and only where the
 * wider menu costs the scene no scale step, which on most screens it does not,
 * because the scene runs out of height before width.
 */
export function menuLabels(width: number, height: number): boolean {
  if (!isLandscape(width, height)) return false;
  const below = height - HEADER_PX;
  return sceneScale(width - LABELLED_PX, below) >= sceneScale(width - RAIL_PX, below);
}
