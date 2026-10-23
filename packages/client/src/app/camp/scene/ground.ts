/**
 * The ground from a Wang tileset (decision 0027; docs/process/assets.md,
 * rule 14): each 16 px tile is picked by the terrain at its four corners and
 * cut out of the sheet by its `bounding_box`, both from PixelLab's
 * `tileset.json`. The layout names a terrain for every corner of the grid,
 * so a grid of cols × rows tiles needs (cols + 1) × (rows + 1) corners.
 */

import { must } from '../../must';

export type Terrain = 'lower' | 'upper';

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface TilesetTile {
  corners: { NE: Terrain; NW: Terrain; SE: Terrain; SW: Terrain };
  bounding_box: Box;
}

export interface TilesetJson {
  tile_size: { width: number; height: number };
  tileset_data: { tiles: TilesetTile[] };
}

export interface GroundTile {
  readonly col: number;
  readonly row: number;
  readonly box: Box;
}

const key = (nw: Terrain, ne: Terrain, sw: Terrain, se: Terrain) => `${nw}/${ne}/${sw}/${se}`;

/** The sheet's tiles by their corners, NW, NE, SW, SE. */
export function tilesByCorners(tileset: TilesetJson): Map<string, Box> {
  const map = new Map<string, Box>();
  for (const t of tileset.tileset_data.tiles) {
    map.set(key(t.corners.NW, t.corners.NE, t.corners.SW, t.corners.SE), t.bounding_box);
  }
  return map;
}

/** The tile for every cell of the grid that the corners describe. */
export function layGround(tileset: TilesetJson, corners: readonly (readonly Terrain[])[]): GroundTile[] {
  const tiles = tilesByCorners(tileset);
  const out: GroundTile[] = [];
  // The loop bounds keep every index in range; `must` says so where the types cannot.
  for (let row = 0; row + 1 < corners.length; row++) {
    const top = must(corners[row], `corner row ${row}`);
    const bottom = must(corners[row + 1], `corner row ${row + 1}`);
    for (let col = 0; col + 1 < top.length; col++) {
      const corner = (cells: readonly Terrain[], index: number) => must(cells[index], `corner ${index} of a row`);
      const k = key(corner(top, col), corner(top, col + 1), corner(bottom, col), corner(bottom, col + 1));
      const box = tiles.get(k);
      if (!box) throw new Error(`the tileset has no tile with corners ${k}`);
      out.push({ col, row, box });
    }
  }
  return out;
}
