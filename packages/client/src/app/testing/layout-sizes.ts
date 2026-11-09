import type { Provider } from '@angular/core';

import { LAYOUT_SIZES } from '../camp/layout-sizes';
import type { LayoutSizes } from '../camp/page-layout';

/** The regions' sizes a test provides for `LAYOUT_SIZES`: what styles.css declares, at the default 16px root font, since jsdom loads no stylesheet. */
export const TEST_LAYOUT_SIZES: LayoutSizes = { header: 36, rail: 56, labelledMenu: 216, menuRow: 64, panelShare: 0.26, panelMin: 272, panelMax: 448 };

/** The provider of those sizes, for a test that renders a page. */
export const testLayoutSizes: Provider = { provide: LAYOUT_SIZES, useValue: () => TEST_LAYOUT_SIZES };
