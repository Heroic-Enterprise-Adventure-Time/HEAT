/**
 * A unit's health bar in the battle scene: its sizes, how much of it is
 * filled, and which of its colours the fill is drawn in. Plain arithmetic in
 * art pixels, tested without a renderer, as `battle-layout.ts` is; the scene
 * draws what this says.
 */

/** The bar in art pixels: its width, centred on the unit, its height, and how far under the unit's feet its top is. Sizes of the picture, set by looking. */
export const BAR_WIDTH = 14;
export const BAR_HEIGHT = 2;
export const BAR_BELOW = 2;

/** The shares of its health above which a unit's bar is drawn as high, and as middling; at or under the second it is low. */
const HIGH_ABOVE = 0.5;
const MIDDLE_ABOVE = 0.25;

/**
 * The bar's colours, by the roles styles.css gives the scene (angular.md,
 * rule 17): the track under the fill, and the fill at each level. The scene
 * reads each through `readColourRole`.
 */
export const BAR_ROLES = {
  track: '--scene-bar-track',
  high: '--scene-bar-high',
  middle: '--scene-bar-middle',
  low: '--scene-bar-low',
} as const;

/** The levels a fill is coloured by. */
export type BarLevel = Exclude<keyof typeof BAR_ROLES, 'track'>;

/** How wide the fill is, in art pixels, never less than one while there is health to show, and the level it is coloured by. */
export function barFill(health: number, maxHealth: number): { readonly width: number; readonly level: BarLevel } {
  const share = health / maxHealth;
  return { width: Math.max(1, Math.round(BAR_WIDTH * share)), level: share > HIGH_ABOVE ? 'high' : share > MIDDLE_ABOVE ? 'middle' : 'low' };
}
