import { layGround, type Terrain, type TilesetJson } from './ground';
import { MAP_CORE_WIDTH, MAP_HEIGHT, MAP_WIDTH, MILLBROOK, cornersAround } from './layout';
import { WALK_SPEED, facingFor, newWalker, randomSpot, step } from './wander';

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
  return () => values[i++ % values.length]!;
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
    expect(tiles[0]!.box).toEqual({ x: 32, y: 48, width: 16, height: 16 });
    expect(tiles[1]!.box).toEqual({ x: 0, y: 32, width: 16, height: 16 });
  });

  it('says which corners the tileset lacks', () => {
    const tileset = fullTileset();
    tileset.tileset_data.tiles = tileset.tileset_data.tiles.slice(1);
    expect(() => layGround(tileset, [['lower', 'lower'], ['lower', 'lower']])).toThrow(/no tile with corners lower\/lower\/lower\/lower/);
  });

  it('covers the whole Millbrook map', () => {
    const tiles = layGround(fullTileset(), MILLBROOK.corners);
    expect(Math.max(...tiles.map((t) => (t.col + 1) * 16))).toBeGreaterThanOrEqual(MAP_WIDTH);
    expect(Math.max(...tiles.map((t) => (t.row + 1) * 16))).toBeGreaterThanOrEqual(MAP_HEIGHT);
  });

  it('runs the ground on past the map as grass, and keeps the corners of the map inside it', () => {
    const window = cornersAround(MILLBROOK, -2, -1, 4, 3);
    expect(window[0]).toEqual(['upper', 'upper', 'upper', 'upper', 'upper']);
    expect(window[1]![2]).toBe(MILLBROOK.corners[0]![0]);
    const road = cornersAround(MILLBROOK, 0, 8, 1, 1);
    expect(road[0]).toEqual(['lower', 'lower']);
  });
});

describe('the Millbrook layout', () => {
  it('stands every facility of the camp, built or not, inside the map', () => {
    expect(MILLBROOK.facilities.map((f) => f.kind).sort()).toEqual(['caravan-hub', 'heroes-hall', 'job-board', 'lumber-camp', 'mine', 'warehouse']);
    for (const f of MILLBROOK.facilities) {
      expect(f.at.x).toBeGreaterThan(0);
      expect(f.at.x).toBeLessThan(MAP_WIDTH);
      expect(f.at.y).toBeLessThan(MAP_HEIGHT);
    }
  });

  it('stands every facility inside the core width, which a narrow box never crops', () => {
    // Half the widest facility canvas, 64 px, on either side of its spot.
    const margin = (MAP_WIDTH - MAP_CORE_WIDTH) / 2;
    for (const f of MILLBROOK.facilities) {
      expect(f.at.x - 32).toBeGreaterThanOrEqual(margin);
      expect(f.at.x + 32).toBeLessThanOrEqual(MAP_WIDTH - margin);
    }
  });

  it('keeps every walkable spot inside the scene', () => {
    for (const a of MILLBROOK.walkable) {
      expect(a.x0).toBeGreaterThanOrEqual(0);
      expect(a.x1).toBeLessThanOrEqual(MAP_WIDTH);
      expect(a.y0).toBeGreaterThanOrEqual(0);
      expect(a.y1).toBeLessThanOrEqual(MAP_HEIGHT);
    }
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

  it('sets out again once its rest is over', () => {
    const walker = newWalker({ x: 50, y: 50 }, sequence(0));
    expect(step(walker, 1000, area, sequence(0.5))).toBe(false);
    expect(walker.target).toBeNull();
    expect(step(walker, 1000, area, sequence(0.5, 0.9, 0.1))).toBe(true);
    expect(walker.target).toEqual({ x: 90, y: 10 });
  });
});
