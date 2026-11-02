import type { FacilityKind } from '@heat/engine';
import { range } from 'es-toolkit';
import type { Terrain } from './ground';

/**
 * Where things stand in a camp, in the map's pixels: 400×225, 16 px tiles.
 * The scene shows the whole map at a whole-number scale and fills the rest
 * of its box with more ground around it (Issue-89). This is display data,
 * not rules, so it lives in the client; the rules' content (what a location
 * recruits and builds, the caps) is the engine's. Millbrook keeps the shape
 * of the mock-up the first art was chosen in (`art/mockups/first-camp-4x.png`):
 * a road across the camp, a square of packed dirt in the middle, the hall at
 * its head, the job board by the road on the left and the warehouse on the
 * right; the facilities a camp builds stand around them.
 */

export const MAP_WIDTH = 400;
export const MAP_HEIGHT = 225;
/**
 * The middle of the map's width that every facility stands inside, 24 px in
 * from each side. The scene's scale only needs this much of the width to fit,
 * so a box a little narrower than the map at the next scale up crops the
 * edges, which hold only ground, rather than drop a whole scale step.
 */
export const MAP_CORE_WIDTH = 352;
export const TILE = 16;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface FacilitySpot {
  readonly kind: FacilityKind;
  /** The centre of the facility's base line (assets.md, rule 18). */
  readonly at: Point;
}

export interface CampLayout {
  readonly ground: string;
  /** The terrain at every corner of the tile grid, rows of columns. */
  readonly corners: readonly (readonly Terrain[])[];
  readonly facilities: readonly FacilitySpot[];
  /** Where heroes may stand: their feet stay inside these. */
  readonly walkable: readonly Rect[];
  /** Where a new hero steps out of the hall. */
  readonly hallDoor: Point;
}

const COLS = Math.ceil(MAP_WIDTH / TILE);
const ROWS = Math.ceil(MAP_HEIGHT / TILE);

function corners(dirt: (col: number, row: number) => boolean): Terrain[][] {
  return range(ROWS + 1).map((row) => range(COLS + 1).map((col): Terrain => (dirt(col, row) ? 'lower' : 'upper')));
}

export const MILLBROOK: CampLayout = {
  ground: 'meadow-01',
  // Dirt is the tileset's lower terrain, grass its upper.
  corners: corners((col, row) => (col >= 9 && col <= 16 && row >= 4 && row <= 11) || row === 8 || row === 9),
  facilities: [
    { kind: 'heroes-hall', at: { x: 200, y: 82 } },
    { kind: 'job-board', at: { x: 110, y: 126 } },
    { kind: 'warehouse', at: { x: 300, y: 124 } },
    { kind: 'lumber-camp', at: { x: 56, y: 92 } },
    { kind: 'mine', at: { x: 344, y: 88 } },
    { kind: 'caravan-hub', at: { x: 92, y: 214 } },
  ],
  walkable: [
    { x0: 156, y0: 96, x1: 244, y1: 172 },
    { x0: 10, y0: 136, x1: 390, y1: 150 },
  ],
  hallDoor: { x: 210, y: 88 },
};

export const LAYOUTS: Readonly<Record<string, CampLayout>> = { millbrook: MILLBROOK };

/**
 * The corners for any window of the tile grid, the map's own where the window
 * overlaps it and grass beyond, so the ground runs on past the map's edge to
 * fill whatever the scene's box shows around it.
 */
export function cornersAround(layout: CampLayout, col0: number, row0: number, cols: number, rows: number): Terrain[][] {
  return range(rows + 1).map((r) => range(cols + 1).map((c): Terrain => layout.corners[row0 + r]?.[col0 + c] ?? 'upper'));
}
