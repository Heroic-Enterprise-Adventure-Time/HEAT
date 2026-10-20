import { MAP_HEIGHT, MAP_WIDTH } from './scene/layout';

/**
 * The arithmetic of the page around the scene (Issue-89): the scene's whole
 * number scale and the window of the world it shows, and whether the facility
 * menu has room for its labels. Plain functions of the sizes, so they are
 * tested without a browser; the CSS lays the regions out and these say what
 * fits.
 */

/** The header bar's height in CSS pixels: 2.25rem. */
export const HEADER_PX = 36;
/** The facility menu as an icon rail: 3.5rem. */
export const RAIL_PX = 56;
/** The facility menu with its labels: 12.5rem. */
export const LABELLED_PX = 200;
/** The content area beside the scene on a landscape screen: 24rem. */
export const PANEL_PX = 384;

/** The largest whole number at which the whole map fits the space, never below 1. */
export function sceneScale(width: number, height: number): number {
  return Math.max(1, Math.floor(Math.min(width / MAP_WIDTH, height / MAP_HEIGHT)));
}

export interface SceneView {
  readonly scale: number;
  /** The window of the world the canvas shows, in art pixels: the map and the ground around it. */
  readonly width: number;
  readonly height: number;
  /** Where the map's top-left corner falls in that window; negative where a narrow box crops the map. */
  readonly mapX: number;
  readonly mapY: number;
}

/**
 * What the scene shows in a box of the given CSS size: the whole map at the
 * whole-number scale, centred, and enough ground around it to cover the box,
 * so there are no bars and no fractional scaling. A box narrower than the map
 * at scale 1, a phone's, crops the map's edges evenly.
 */
export function sceneView(boxWidth: number, boxHeight: number): SceneView {
  const scale = sceneScale(boxWidth, boxHeight);
  const width = Math.max(1, Math.ceil(boxWidth / scale));
  const height = Math.max(1, Math.ceil(boxHeight / scale));
  return { scale, width, height, mapX: Math.floor((width - MAP_WIDTH) / 2), mapY: Math.floor((height - MAP_HEIGHT) / 2) };
}

/** The scene's box on a narrow screen: the page's width, and the map's height at that width's scale. */
export function narrowStageHeight(width: number): number {
  return MAP_HEIGHT * Math.max(1, Math.floor(width / MAP_WIDTH));
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
  return sceneScale(width - LABELLED_PX - PANEL_PX, below) >= sceneScale(width - RAIL_PX - PANEL_PX, below);
}
