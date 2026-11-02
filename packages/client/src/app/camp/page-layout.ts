import { clamp } from 'es-toolkit';
import { MAP_CORE_WIDTH, MAP_HEIGHT, MAP_WIDTH } from './scene/layout';

/**
 * The arithmetic of the page around the scene (Issue-89): whether the
 * regions stand side by side or stack, how wide the panel is, whether the
 * menu shows its labels and at what size its icons, and the scene's whole
 * number scale and the window of the world it shows. Plain functions of the
 * sizes, so they are tested without a browser; the CSS lays the regions out
 * by the classes these decide, and the regions' own sizes are the CSS's,
 * read from its tokens. The regions are decided in CSS pixels; the
 * scene's scale counts device pixels, so that at a fractional device pixel
 * ratio every art pixel is still the same whole number of them (Issue-95).
 */

/**
 * The page's regions in CSS pixels, read from the tokens in styles.css by
 * `readLayoutSizes`, so the arithmetic and the stylesheet hold one copy, at
 * the player's font size (best-practices.md, rule 10).
 */
export interface LayoutSizes {
  /** The header bar's height. */
  readonly header: number;
  /** The facility menu as an icon rail. */
  readonly rail: number;
  /** The facility menu with its labels, room for a 64 px icon beside them. */
  readonly labelledMenu: number;
  /** The menu as a row under the scene when the regions stack. */
  readonly menuRow: number;
  /** The panel beside the scene: its share of the window's width, held between the two bounds. */
  readonly panelShare: number;
  readonly panelMin: number;
  readonly panelMax: number;
}

/** The token each length is read from. */
const LENGTH_TOKENS = {
  header: '--header-height',
  rail: '--menu-rail-width',
  labelledMenu: '--menu-labelled-width',
  menuRow: '--menu-row-height',
  panelMin: '--panel-min-width',
  panelMax: '--panel-max-width',
} as const;
const PANEL_SHARE_TOKEN = '--panel-share';

/**
 * The regions' sizes from the root element's computed style: a `rem` token
 * at the root font size, a `px` token as it is, the panel's share as a
 * fraction of the window's width from its `vw`. Pure in its argument, so a
 * test hands it a style of its own; a token missing or in another unit is a
 * mistake in styles.css and fails here with its name.
 */
export function readLayoutSizes(root: Pick<CSSStyleDeclaration, 'fontSize' | 'getPropertyValue'>): LayoutSizes {
  const rem = parseFloat(root.fontSize);
  const read = (token: string, unit: RegExp): number => {
    const value = root.getPropertyValue(token).trim();
    const match = unit.exec(value);
    if (!match?.[1]) throw new Error(`styles.css: ${token} is "${value}", not a length the layout can read`);
    return value.endsWith('rem') ? Number(match[1]) * rem : Number(match[1]);
  };
  const length = (token: string) => read(token, /^(\d*\.?\d+)(?:rem|px)$/);
  return {
    header: length(LENGTH_TOKENS.header),
    rail: length(LENGTH_TOKENS.rail),
    labelledMenu: length(LENGTH_TOKENS.labelledMenu),
    menuRow: length(LENGTH_TOKENS.menuRow),
    panelShare: read(PANEL_SHARE_TOKEN, /^(\d*\.?\d+)vw$/) / 100,
    panelMin: length(LENGTH_TOKENS.panelMin),
    panelMax: length(LENGTH_TOKENS.panelMax),
  };
}

/** The scale side by side must give the scene; below it the regions stack. */
export const SIDE_BY_SIDE_MIN_SCALE = 2;
/** The scene scale from which the labelled menu draws its icons at 2×. */
export const BIG_ICONS_MIN_SCALE = 3;

/** The largest whole number at which the map's height and its core width fit the space, never below 1; in whatever unit the space is given. */
export function sceneScale(width: number, height: number): number {
  return Math.max(1, Math.floor(Math.min(width / MAP_CORE_WIDTH, height / MAP_HEIGHT)));
}

/** The panel beside the scene: its share of the window, held between its bounds, as the CSS's `--panel-width` clamps it. */
export function panelPx(width: number, sizes: LayoutSizes): number {
  return clamp(width * sizes.panelShare, sizes.panelMin, sizes.panelMax);
}

/** The scene's scale with the regions side by side and the given menu width. */
function sideScale(width: number, height: number, menu: number, sizes: LayoutSizes): number {
  return sceneScale(width - menu - panelPx(width, sizes), height - sizes.header);
}

/**
 * Whether the menu, the scene and the panel stand side by side: only where
 * that still gives the scene scale 2, so a tablet or a small window stacks
 * them, with the scene across the full width, rather than squeeze the scene
 * to scale 1 between two columns.
 */
export function isSideBySide(width: number, height: number, sizes: LayoutSizes): boolean {
  return width > height && sideScale(width, height, sizes.rail, sizes) >= SIDE_BY_SIDE_MIN_SCALE;
}

/** Whether the menu shows its labels: only side by side, and only where the wider menu costs the scene no scale step. */
export function menuLabels(width: number, height: number, sizes: LayoutSizes): boolean {
  return isSideBySide(width, height, sizes) && sideScale(width, height, sizes.labelledMenu, sizes) >= sideScale(width, height, sizes.rail, sizes);
}

/** The menu's icon scale: 2× in a labelled menu beside a scene at scale 3 or more, so the icons keep up with it; else 1×. */
export function iconScale(width: number, height: number, sizes: LayoutSizes): number {
  return menuLabels(width, height, sizes) && sideScale(width, height, sizes.labelledMenu, sizes) >= BIG_ICONS_MIN_SCALE ? 2 : 1;
}

/**
 * The scene's box height in CSS pixels when the regions stack: the map's
 * height at the largest scale, in device pixels, that fits both the page's
 * width and the height left under the header and the menu row, so the scene
 * and the menu stay on screen.
 */
export function stackedStageHeight(width: number, height: number, sizes: LayoutSizes, ratio = 1): number {
  const byHeight = Math.floor(((height - sizes.header - sizes.menuRow) * ratio) / MAP_HEIGHT);
  return (MAP_HEIGHT * Math.max(1, Math.min(Math.floor((width * ratio) / MAP_CORE_WIDTH), byHeight))) / ratio;
}

/**
 * The scale heroes are drawn at in the camp, in device pixels per art pixel:
 * half the scene's, rounded up (Issue-99), so a whole number. Never below one
 * CSS pixel per art pixel, as at scene scale 1 on a plain screen, so a phone
 * with a high device pixel ratio does not shrink its heroes past a tap; and
 * never above the scene's own scale (Issue-95).
 */
export function heroScale(sceneScale: number, ratio = 1): number {
  return clamp(Math.round(ratio), Math.ceil(sceneScale / 2), sceneScale);
}

export interface SceneView {
  /** Device pixels per art pixel of the map. */
  readonly scale: number;
  /** The heroes' own whole-number scale, from `heroScale`. */
  readonly heroScale: number;
  /** The window of the world the canvas shows, in art pixels: the map and the ground around it. */
  readonly width: number;
  readonly height: number;
  /** Where the map's top-left corner falls in that window; negative where a narrow box crops the map. */
  readonly mapX: number;
  readonly mapY: number;
}

/**
 * What the scene shows in a box of the given size in device pixels, at the
 * given device pixel ratio: the map at the whole-number scale, centred, and
 * enough ground around it to cover the box, so there are no bars and no
 * fractional scaling. A box narrower than the whole map at that scale, a
 * phone's or a tablet's, crops the map's edges evenly, never into its core.
 */
export function sceneView(boxWidth: number, boxHeight: number, ratio = 1): SceneView {
  const scale = sceneScale(boxWidth, boxHeight);
  const width = Math.max(1, Math.ceil(boxWidth / scale));
  const height = Math.max(1, Math.ceil(boxHeight / scale));
  return {
    scale,
    heroScale: heroScale(scale, ratio),
    width,
    height,
    mapX: Math.floor((width - MAP_WIDTH) / 2),
    mapY: Math.floor((height - MAP_HEIGHT) / 2),
  };
}
