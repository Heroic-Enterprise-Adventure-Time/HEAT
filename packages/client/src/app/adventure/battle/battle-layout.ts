import type { Line, Side } from '@heat/engine';

/**
 * Where the battle scene puts things (game.md, "How the game looks" and
 * "The battle"): the camp's sprites arranged side-on, the party on the left
 * facing east and the other side on the right facing west, each side's four
 * lines from the middle outwards, a line's units spread in depth. Plain
 * arithmetic in art pixels, tested without a renderer, as the camp's
 * page-layout.ts is.
 */

/** The stage in art pixels; the scene shows more ground around it to fill its box. */
export const STAGE_WIDTH = 320;
export const STAGE_HEIGHT = 180;

/** The row the units' feet stand on when a line holds one unit. */
export const FEET_Y = 124;
/** From the middle of the stage to each side's front line, and from one line to the next. */
const FRONT_GAP = 18;
const LINE_GAP = 34;
/** Between two units of one line, front to back of the picture. */
const DEPTH_GAP = 14;

const LINE_INDEX: Readonly<Record<Line, number>> = { front: 0, near: 1, far: 2, back: 3 };

/** Where a unit stands: its line's column, and its place among the line's `count` units, `index` from 0. */
export function spot(side: Side, line: Line, index: number, count: number): { x: number; y: number } {
  const fromMiddle = FRONT_GAP + LINE_INDEX[line] * LINE_GAP;
  const x = STAGE_WIDTH / 2 + (side === 'party' ? -fromMiddle : fromMiddle);
  const y = FEET_Y + Math.round((index - (count - 1) / 2) * DEPTH_GAP);
  return { x, y };
}

/**
 * Every unit's spot, a line's units in a fixed order (by id), so a unit
 * keeps its place while its line does not change.
 */
export function spots(units: readonly { readonly unitId: string; readonly side: Side; readonly line: Line }[]): Map<string, { x: number; y: number }> {
  const byLine = new Map<string, string[]>();
  for (const u of units) {
    const key = `${u.side}/${u.line}`;
    byLine.set(key, [...(byLine.get(key) ?? []), u.unitId]);
  }
  const out = new Map<string, { x: number; y: number }>();
  for (const u of units) {
    const line = [...byLine.get(`${u.side}/${u.line}`)!].sort();
    out.set(u.unitId, spot(u.side, u.line, line.indexOf(u.unitId), line.length));
  }
  return out;
}

/** How far the other side starts to the right of its spots, so that every one of it comes on from beyond the stage's edge. */
export function entryOffset(xs: readonly number[]): number {
  return xs.length === 0 ? 0 : STAGE_WIDTH + 24 - Math.min(...xs);
}

export interface BattleView {
  /** Device pixels per art pixel. */
  readonly scale: number;
  /** The window the canvas shows, in art pixels. */
  readonly width: number;
  readonly height: number;
  /** Where the stage's top-left corner falls in that window. */
  readonly stageX: number;
  readonly stageY: number;
}

/** The largest whole number of device pixels per art pixel at which the stage fits the box, at least 1. */
export function battleScale(boxWidth: number, boxHeight: number): number {
  return Math.max(1, Math.floor(Math.min(boxWidth / STAGE_WIDTH, boxHeight / STAGE_HEIGHT)));
}

/**
 * What the scene shows in a box of this size in device pixels: the stage at
 * the whole-number scale, centred, with ground around it to cover the box,
 * as the camp does (decision 0028).
 */
export function battleView(boxWidth: number, boxHeight: number): BattleView {
  const scale = battleScale(boxWidth, boxHeight);
  const width = Math.max(1, Math.ceil(boxWidth / scale));
  const height = Math.max(1, Math.ceil(boxHeight / scale));
  return { scale, width, height, stageX: Math.floor((width - STAGE_WIDTH) / 2), stageY: Math.floor((height - STAGE_HEIGHT) / 2) };
}

/**
 * The stage's box height in CSS pixels when the controls go below it: the
 * stage at the largest whole scale that fits the page's width, in device
 * pixels, and no more than half the window's height.
 */
export function stackedBattleHeight(width: number, height: number, ratio = 1): number {
  const byWidth = Math.floor((width * ratio) / STAGE_WIDTH);
  const byHeight = Math.floor((height * ratio) / 2 / STAGE_HEIGHT);
  return (STAGE_HEIGHT * Math.max(1, Math.min(byWidth, byHeight))) / ratio;
}
