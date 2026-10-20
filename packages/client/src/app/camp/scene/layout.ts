import type { FacilityKind } from '@heat/engine';
import type { Terrain } from './ground';

/**
 * Where things stand in a camp, in the scene's pixels: 320×180, 16 px tiles.
 * This is display data, not rules, so it lives in the client; the rules'
 * content (what a location recruits, the caps) is the engine's. The first
 * layout follows the mock-up the art was chosen in
 * (`art/mockups/first-camp-4x.png`): a road across the camp, a square of
 * packed dirt in the middle, the hall at its head, the job board by the road
 * on the left and the warehouse on the right.
 */

export const SCENE_WIDTH = 320;
export const SCENE_HEIGHT = 180;
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

const COLS = Math.ceil(SCENE_WIDTH / TILE);
const ROWS = Math.ceil(SCENE_HEIGHT / TILE);

function corners(dirt: (col: number, row: number) => boolean): Terrain[][] {
  return Array.from({ length: ROWS + 1 }, (_, row) =>
    Array.from({ length: COLS + 1 }, (_, col): Terrain => (dirt(col, row) ? 'lower' : 'upper')),
  );
}

export const MILLBROOK: CampLayout = {
  ground: 'meadow-01',
  // Dirt is the tileset's lower terrain, grass its upper.
  corners: corners((col, row) => (col >= 7 && col <= 13 && row >= 4 && row <= 9) || row === 7 || row === 8),
  facilities: [
    { kind: 'heroes-hall', at: { x: 160, y: 66 } },
    { kind: 'job-board', at: { x: 84, y: 110 } },
    { kind: 'warehouse', at: { x: 262, y: 108 } },
  ],
  walkable: [
    { x0: 120, y0: 80, x1: 200, y1: 148 },
    { x0: 10, y0: 120, x1: 310, y1: 134 },
  ],
  hallDoor: { x: 170, y: 72 },
};

export const LAYOUTS: Readonly<Record<string, CampLayout>> = { millbrook: MILLBROOK };
