import type { LayoutSizes } from '../camp/page-layout';

/** The regions' sizes a test provides for `LAYOUT_SIZES`: what styles.css declares, at the default 16px root font, since jsdom loads no stylesheet. */
export const TEST_LAYOUT_SIZES: LayoutSizes = { header: 36, rail: 56, labelledMenu: 216, menuRow: 64, panelShare: 0.26, panelMin: 272, panelMax: 448 };
