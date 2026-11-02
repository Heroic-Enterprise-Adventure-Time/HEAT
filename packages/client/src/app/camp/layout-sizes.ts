import { InjectionToken } from '@angular/core';
import { readLayoutSizes, type LayoutSizes } from './page-layout';

/**
 * How a page reads the regions' sizes: from the tokens on `:root` in
 * styles.css, at the root font size the player has now, so a resize or a
 * font-size change reads them again. A test provides sizes of its own, since
 * jsdom loads no stylesheet (angular.md, rule 2).
 */
export const LAYOUT_SIZES = new InjectionToken<() => LayoutSizes>('heat.layout.sizes', {
  providedIn: 'root',
  factory: () => () => readLayoutSizes(getComputedStyle(document.documentElement)),
});
