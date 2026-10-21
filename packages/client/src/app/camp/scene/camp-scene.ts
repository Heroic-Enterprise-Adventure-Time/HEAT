import { Application, Assets, Container, Rectangle, Sprite, Texture, TextureStyle } from 'pixi.js';
import type { FacilityKind } from '@heat/engine';
import { layGround, type TilesetJson } from './ground';
import { MAP_HEIGHT, MAP_WIDTH, TILE, cornersAround, type CampLayout } from './layout';
import { sceneView } from '../page-layout';
import { newWalker, randomSpot, step, type Facing, type Walker } from './wander';

/**
 * The camp scene, drawn with PixiJS (decision 0028): the camp's whole map,
 * scaled up by the largest whole number that fits its box, so every art pixel
 * is a square of screen pixels, with the ground running on around the map to
 * fill the rest of the box (Issue-89). Ground
 * tiles, then the facilities and the heroes in one container sorted by the
 * line they stand on (assets.md, rule 18), which is what puts a hero walking
 * behind the hall behind it. The scene knows nothing of the hub: the camp
 * component hands it the heroes and hears its clicks.
 */

export interface SceneHero {
  readonly id: string;
  readonly spriteSet: string;
}

export interface SceneCallbacks {
  readonly onFacility: (kind: FacilityKind) => void;
  readonly onHero: (id: string) => void;
}

export interface CampSceneHandle {
  setHeroes(heroes: readonly SceneHero[], arriving?: string): void;
  destroy(): void;
}

type WalkDirection = 'south' | 'east' | 'north';
const WALK_DIRECTIONS: readonly WalkDirection[] = ['south', 'east', 'north'];
const STILL_DIRECTIONS: readonly Facing[] = ['south', 'east', 'north', 'west'];
const WALK_FRAMES = 6;
const WALK_FRAME_MS = 100;

interface HeroFrames {
  still: Record<Facing, Texture>;
  walk: Record<WalkDirection, Texture[]>;
  /** The row of the lowest opaque pixel: of the south still for the stills, of each walk's first frame for the walk. */
  stillFoot: number;
  walkFoot: Record<WalkDirection, number>;
}

interface HeroOnScreen {
  sprite: Sprite;
  walker: Walker;
  frames: HeroFrames;
  clockMs: number;
}

/** The row of the lowest pixel that is not transparent: where a figure's feet or a building's base are. */
function lowestOpaqueRow(texture: Texture): number {
  const { width, height } = texture.source;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return height - 1;
  context.drawImage(texture.source.resource as CanvasImageSource, 0, 0);
  const data = context.getImageData(0, 0, width, height).data;
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) if ((data[(y * width + x) * 4 + 3] ?? 0) > 0) return y;
  }
  return height - 1;
}

const heroFrames = new Map<string, Promise<HeroFrames>>();

function loadHeroFrames(set: string): Promise<HeroFrames> {
  let frames = heroFrames.get(set);
  if (!frames) {
    frames = (async () => {
      const base = `/art/heroes/${set}`;
      const still = Object.fromEntries(
        await Promise.all(STILL_DIRECTIONS.map(async (d) => [d, await Assets.load<Texture>(`${base}/still-${d}.png`)] as const)),
      ) as Record<Facing, Texture>;
      const walk = Object.fromEntries(
        await Promise.all(
          WALK_DIRECTIONS.map(async (d) => [
            d,
            await Promise.all(Array.from({ length: WALK_FRAMES }, (_, i) => Assets.load<Texture>(`${base}/walk-${d}-${i}.png`))),
          ] as const),
        ),
      ) as Record<WalkDirection, Texture[]>;
      const walkFoot = Object.fromEntries(WALK_DIRECTIONS.map((d) => [d, lowestOpaqueRow(walk[d][0]!)])) as Record<WalkDirection, number>;
      return { still, walk, stillFoot: lowestOpaqueRow(still.south), walkFoot };
    })();
    heroFrames.set(set, frames);
  }
  return frames;
}

/** Shows a frame with its foot row on the sprite's position and its canvas centred there. */
function show(sprite: Sprite, texture: Texture, foot: number, mirrored: boolean): void {
  sprite.texture = texture;
  sprite.pivot.set(texture.width / 2, foot + 1);
  sprite.scale.x = mirrored ? -1 : 1;
  sprite.hitArea = new Rectangle(texture.width / 2 - 8, foot - 27, 16, 28);
}

/**
 * Draws the camp in the host element. `levels` says which picture each
 * facility shows: 0 for one the camp has not built, an unfinished building
 * (docs/process/assets.md, rule 17).
 */
export async function createCampScene(
  host: HTMLElement,
  layout: CampLayout,
  levels: Readonly<Partial<Record<FacilityKind, number>>>,
  callbacks: SceneCallbacks,
): Promise<CampSceneHandle> {
  // Nearest-neighbour everywhere: pixel art blurs under any other filter.
  TextureStyle.defaultOptions.scaleMode = 'nearest';
  const app = new Application();
  await app.init({ width: MAP_WIDTH, height: MAP_HEIGHT, background: '#4f7f2a', antialias: false, resolution: 1, roundPixels: true });
  app.canvas.style.imageRendering = 'pixelated';
  app.canvas.style.display = 'block';
  host.appendChild(app.canvas);

  const tileset = (await (await fetch(`/art/ground/${layout.ground}/tileset.json`)).json()) as TilesetJson;
  const sheet = await Assets.load<Texture>(`/art/ground/${layout.ground}/tileset.png`);

  // The world: the ground, then the facilities and heroes back to front by the
  // line they stand on, all in the map's coordinates, moved as one to centre
  // the map in whatever window the box shows.
  const world = new Container();
  const ground = new Container();
  const things = new Container({ sortableChildren: true });
  world.addChild(ground, things);
  app.stage.addChild(world);

  /** Lays the ground over the window, the map's tiles where it overlaps the map and grass around it. */
  const layWindow = (x0: number, y0: number, width: number, height: number) => {
    for (const child of ground.removeChildren()) child.destroy();
    const col0 = Math.floor(x0 / TILE);
    const row0 = Math.floor(y0 / TILE);
    const cols = Math.ceil((x0 + width) / TILE) - col0;
    const rows = Math.ceil((y0 + height) / TILE) - row0;
    for (const tile of layGround(tileset, cornersAround(layout, col0, row0, cols, rows))) {
      const frame = new Rectangle(tile.box.x, tile.box.y, tile.box.width, tile.box.height);
      const sprite = new Sprite(new Texture({ source: sheet.source, frame }));
      sprite.position.set((col0 + tile.col) * TILE, (row0 + tile.row) * TILE);
      ground.addChild(sprite);
    }
  };

  let shown = '';
  const resize = () => {
    const view = sceneView(host.clientWidth, host.clientHeight);
    const key = `${view.width}x${view.height}`;
    app.canvas.style.width = `${view.width * view.scale}px`;
    app.canvas.style.height = `${view.height * view.scale}px`;
    if (key === shown) return;
    shown = key;
    app.renderer.resize(view.width, view.height);
    world.position.set(view.mapX, view.mapY);
    layWindow(-view.mapX, -view.mapY, view.width, view.height);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  for (const spot of layout.facilities) {
    const texture = await Assets.load<Texture>(`/art/facilities/${spot.kind}/level-${levels[spot.kind] ?? 1}.png`);
    const sprite = new Sprite(texture);
    sprite.pivot.set(texture.width / 2, lowestOpaqueRow(texture) + 1);
    sprite.position.set(spot.at.x, spot.at.y);
    sprite.zIndex = spot.at.y;
    // Every facility opens its panel, as its entry in the menu does (Issue-89).
    sprite.eventMode = 'static';
    sprite.cursor = 'pointer';
    sprite.on('pointertap', () => callbacks.onFacility(spot.kind));
    things.addChild(sprite);
  }

  const heroes = new Map<string, HeroOnScreen>();
  let destroyed = false;

  app.ticker.add((ticker) => {
    for (const hero of heroes.values()) {
      const walking = step(hero.walker, ticker.deltaMS, layout.walkable, Math.random);
      const { facing } = hero.walker;
      if (walking) {
        hero.clockMs += ticker.deltaMS;
        const direction: WalkDirection = facing === 'west' ? 'east' : facing;
        const frame = Math.floor(hero.clockMs / WALK_FRAME_MS) % WALK_FRAMES;
        show(hero.sprite, hero.frames.walk[direction][frame]!, hero.frames.walkFoot[direction], facing === 'west');
      } else {
        hero.clockMs = 0;
        show(hero.sprite, hero.frames.still[facing], hero.frames.stillFoot, false);
      }
      hero.sprite.position.set(Math.round(hero.walker.x), Math.round(hero.walker.y));
      hero.sprite.zIndex = hero.walker.y;
    }
  });

  return {
    setHeroes(list, arriving) {
      const wanted = new Set(list.map((h) => h.id));
      for (const [id, hero] of heroes) {
        if (!wanted.has(id)) {
          hero.sprite.destroy();
          heroes.delete(id);
        }
      }
      for (const h of list) {
        if (heroes.has(h.id)) continue;
        void loadHeroFrames(h.spriteSet).then((frames) => {
          if (destroyed || heroes.has(h.id)) return;
          // A new recruit steps out of the hall; the rest are already about.
          const walker =
            h.id === arriving
              ? newWalker(layout.hallDoor, Math.random, randomSpot(layout.walkable, Math.random))
              : newWalker(randomSpot(layout.walkable, Math.random), Math.random);
          const sprite = new Sprite(frames.still.south);
          sprite.eventMode = 'static';
          sprite.cursor = 'pointer';
          sprite.on('pointertap', () => callbacks.onHero(h.id));
          things.addChild(sprite);
          heroes.set(h.id, { sprite, walker, frames, clockMs: 0 });
        });
      }
    },
    destroy() {
      destroyed = true;
      observer.disconnect();
      app.destroy(true, { children: true });
    },
  };
}
