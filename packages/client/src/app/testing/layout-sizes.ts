import type { Provider } from '@angular/core';

import { LAYOUT_SIZES } from '../camp/layout-sizes';
import { type LayoutSizes, readLayoutSizes } from '../camp/page-layout';
import { rootStyle } from './style-tokens';

/** The regions' sizes a test provides for `LAYOUT_SIZES`: what styles.css declares, read from it at the default 16px root font, since jsdom loads no stylesheet. */
export const TEST_LAYOUT_SIZES: LayoutSizes = readLayoutSizes(rootStyle());

/** The provider of those sizes, for a test that renders a page. */
export const testLayoutSizes: Provider = { provide: LAYOUT_SIZES, useValue: () => TEST_LAYOUT_SIZES };
