import { LOCATIONS, must } from '@heat/engine';

import { GROUNDS } from '../../ground-sets';
import { layGround, type Terrain, type TilesetJson } from './ground';
import { cornersAround, groundAt, HIGHCRAG, LAYOUTS, MAP_CORE_WIDTH, MAP_HEIGHT, MAP_WIDTH, MILLBROOK } from './layout';
import { facingFor, gone, leave, newWalker, randomSpot, step, WALK_SPEED } from './wander';

/** A tileset with one tile for each of the sixteen corner combinations, as PixelLab's tileset15 has. */
function fullTileset(): TilesetJson {
  const terrains: Terrain[] = ['lower', 'upper'];
  const tiles = [];
  let i = 0;
  for (const NW of terrains)
    for (const NE of terrains)
      for (const SW of terrains)
        for (const SE of terrains) {
          tiles.push({ corners: { NW, NE, SW, SE }, bounding_box: { x: (i % 4) * 16, y: Math.floor(i / 4) * 16, width: 16, height: 16 } });
          i++;
        }
  return { tile_size: { width: 16, height: 16 }, tileset_data: { tiles } };
}

/** A random source that plays back the given numbers in a loop. */
function sequence(...values: number[]) {
  let i = 0;
  return () => must(values[i++ % values.length], 'a value of the sequence');
}

describe('the ground', () => {
  it('picks each tile by its four corners', () => {
    const tiles = layGround(fullTileset(), [
      ['upper', 'upper', 'lower'],
      ['upper', 'lower', 'lower'],
    ]);
    expect(tiles.map((t) => [t.col, t.row])).toEqual([
      [0, 0],
      [1, 0],
    ]);
    // upper/upper/upper/lower is index 14 in the order above; upper/lower/lower/lower is 8.
    expect(tiles[0]?.box).toEqual({ x: 32, y: 48, width: 16, height: 16 });
    expect(tiles[1]?.box).toEqual({ x: 0, y: 32, width: 16, height: 16 });
  });

  it('says which corners the tileset lacks', () => {
    const tileset = fullTileset();
    tileset.tileset_data.tiles = tileset.tileset_data.tiles.slice(1);
    expect(() => layGround(tileset, [['lower', 'lower'], ['lower', 'lower']])).toThrow(/no tile with corners lower\/lower\/lower\/lower/);
  });

  for (const [id, layout] of Object.entries(LAYOUTS)) {
    it(`covers the whole map at ${id}`, () => {
      const tiles = layGround(fullTileset(), layout.corners);
      expect(Math.max(...tiles.map((t) => (t.col + 1) * 16))).toBeGreaterThanOrEqual(MAP_WIDTH);
      expect(Math.max(...tiles.map((t) => (t.row + 1) * 16))).toBeGreaterThanOrEqual(MAP_HEIGHT);
    });
  }

  it('runs the ground on past the map as grass, and keeps the corners of the map inside it', () => {
    const window = cornersAround(MILLBROOK, -2, -1, 4, 3);
    expect(window[0]).toEqual(['upper', 'upper', 'upper', 'upper', 'upper']);
    expect(must(window[1], 'row 1')[2]).toBe(must(MILLBROOK.corners[0], 'the first corner row')[0]);
    const road = cornersAround(MILLBROOK, 0, 8, 1, 1);
    expect(road[0]).toEqual(['lower', 'lower']);
  });
});

describe('the layouts', () => {
  it("are one for every location of the engine's content, each standing exactly the facilities the location gives a camp, built or not", () => {
    expect(Object.keys(LAYOUTS).sort()).toEqual(LOCATIONS.map((l) => l.id).sort());
    for (const at of LOCATIONS) {
      const layout = must(LAYOUTS[at.id], `the layout of ${at.id}`);
      expect(layout.facilities.map((f) => f.kind).sort(), at.id).toEqual([...at.sharedFacilities, ...at.ownFacilities, ...at.buildableFacilities].sort());
    }
  });

  it('stand Millbrook on the meadow and Highcrag on the crag, which is also the ground of a battle that left from each', () => {
    expect(MILLBROOK.ground).toBe('meadow-01');
    expect(HIGHCRAG.ground).toBe('crag-01');
    for (const [id, layout] of Object.entries(LAYOUTS)) {
      expect(groundAt(id)).toBe(layout.ground);
      expect(GROUNDS[layout.ground].backdrop).toMatch(/^#[0-9a-f]{6}$/);
    }
    // A location this client has no layout for, as a newer deploy may name, is drawn on the meadow.
    expect(groundAt('atlantis')).toBe('meadow-01');
  });

  it('give Highcrag the hall, the warehouse, the job board, the caravan hub and the quarry (Issue-356)', () => {
    expect(HIGHCRAG.facilities.map((f) => f.kind)).toEqual(['heroes-hall', 'warehouse', 'job-board', 'caravan-hub', 'quarry']);
  });

  for (const [id, layout] of Object.entries(LAYOUTS)) {
    it(`stands every facility of ${id} inside the map`, () => {
      for (const f of layout.facilities) {
        expect(f.at.x).toBeGreaterThan(0);
        expect(f.at.x).toBeLessThan(MAP_WIDTH);
        expect(f.at.y).toBeLessThan(MAP_HEIGHT);
      }
    });

    it(`stands every facility of ${id} inside the core width, which a narrow box never crops`, () => {
      // Half the widest facility canvas, 64 px, on either side of its spot.
      const margin = (MAP_WIDTH - MAP_CORE_WIDTH) / 2;
      for (const f of layout.facilities) {
        expect(f.at.x - 32).toBeGreaterThanOrEqual(margin);
        expect(f.at.x + 32).toBeLessThanOrEqual(MAP_WIDTH - margin);
      }
    });

    it(`keeps every walkable spot of ${id}, and its hall's door, inside the scene`, () => {
      for (const a of layout.walkable) {
        expect(a.x0).toBeGreaterThanOrEqual(0);
        expect(a.x1).toBeLessThanOrEqual(MAP_WIDTH);
        expect(a.y0).toBeGreaterThanOrEqual(0);
        expect(a.y1).toBeLessThanOrEqual(MAP_HEIGHT);
        expect(a.x1).toBeGreaterThan(a.x0);
        expect(a.y1).toBeGreaterThan(a.y0);
      }
      expect(layout.hallDoor.x).toBeGreaterThan(0);
      expect(layout.hallDoor.x).toBeLessThan(MAP_WIDTH);
      expect(layout.hallDoor.y).toBeGreaterThan(0);
      expect(layout.hallDoor.y).toBeLessThan(MAP_HEIGHT);
    });

    it(`ends every walkable area of ${id} on the earth: the grid corner nearest each of its four corners is the lower terrain`, () => {
      // The nearest corner alone, and the area's own four corners alone: an area may still end up to half a tile into a
      // blended edge, as Millbrook's road does along its sides, and nothing here reads what lies between its corners.
      const lower = (x: number, y: number) => layout.corners[Math.round(y / 16)]?.[Math.round(x / 16)] === 'lower';
      for (const a of layout.walkable) {
        for (const [x, y] of [[a.x0, a.y0], [a.x1, a.y0], [a.x0, a.y1], [a.x1, a.y1]] as const) expect(lower(x, y), `${id} ${x},${y}`).toBe(true);
      }
    });
  }

  it('runs the ground on past the map as rock at Highcrag, where Millbrook has grass: the upper terrain of each', () => {
    const window = cornersAround(HIGHCRAG, -2, -1, 4, 3);
    expect(window[0]).toEqual(['upper', 'upper', 'upper', 'upper', 'upper']);
    // The road leaves the yard at the foot of the map, two corners wide.
    expect(cornersAround(HIGHCRAG, 12, 14, 1, 1)[0]).toEqual(['lower', 'lower']);
  });
});

describe('wandering', () => {
  const area = [{ x0: 0, y0: 0, x1: 100, y1: 100 }];

  it('picks spots inside the walkable areas, weighted by their size', () => {
    const areas = [
      { x0: 0, y0: 0, x1: 10, y1: 10 },
      { x0: 100, y0: 100, x1: 130, y1: 110 },
    ];
    // 100 of the 400 square pixels are the first area.
    expect(randomSpot(areas, sequence(0.2, 0.5, 0.5))).toEqual({ x: 5, y: 5 });
    expect(randomSpot(areas, sequence(0.9, 0.5, 0.5))).toEqual({ x: 115, y: 105 });
  });

  it('faces the larger axis of its motion', () => {
    expect(facingFor(5, 1)).toBe('east');
    expect(facingFor(-5, 1)).toBe('west');
    expect(facingFor(1, 5)).toBe('south');
    expect(facingFor(1, -5)).toBe('north');
  });

  it('walks to its target at its speed, then stands still', () => {
    const walker = newWalker({ x: 0, y: 0 }, sequence(0.5), { x: WALK_SPEED * 2, y: 0 });
    expect(step(walker, 1000, area, sequence(0.5))).toBe(true);
    expect(walker).toMatchObject({ x: WALK_SPEED, y: 0, facing: 'east' });
    expect(step(walker, 1000, area, sequence(0.5))).toBe(false);
    expect(walker.target).toBeNull();
    expect(walker.x).toBe(WALK_SPEED * 2);
    expect(walker.restMs).toBeGreaterThan(0);
  });

  it('walks at the speed it is given, as a hero drawn at half the scene scale does', () => {
    const walker = newWalker({ x: 0, y: 0 }, sequence(0.5), { x: 100, y: 0 });
    step(walker, 1000, area, sequence(0.5), WALK_SPEED / 2);
    expect(walker.x).toBe(WALK_SPEED / 2);
  });

  it('sets out again once its rest is over', () => {
    const walker = newWalker({ x: 50, y: 50 }, sequence(0));
    expect(step(walker, 1000, area, sequence(0.5))).toBe(false);
    expect(walker.target).toBeNull();
    expect(step(walker, 1000, area, sequence(0.5, 0.9, 0.1))).toBe(true);
    expect(walker.target).toEqual({ x: 90, y: 10 });
  });

  it('leaves for a door from mid-walk, and is gone once there, never setting out again', () => {
    const walker = newWalker({ x: 0, y: 0 }, sequence(0.5), { x: 90, y: 90 });
    step(walker, 500, area, sequence(0.5));
    leave(walker, { x: 0, y: WALK_SPEED });
    expect(gone(walker)).toBe(false);
    expect(step(walker, 2000, area, sequence(0.5))).toBe(false);
    expect(walker).toMatchObject({ x: 0, y: WALK_SPEED, target: null });
    expect(gone(walker)).toBe(true);
    expect(step(walker, 60_000, area, sequence(0.5))).toBe(false);
    expect(walker.target).toBeNull();
  });
});
