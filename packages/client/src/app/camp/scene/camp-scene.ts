import { range } from 'es-toolkit';
import { Application, Assets, Container, Rectangle, Sprite, Texture, TextureStyle } from 'pixi.js';

import { facilityArtLevel, type FacilityKind, must } from '@heat/engine';

import { lowestOpaqueRow } from '../../pixel-art';
import { sceneView, type SceneView } from '../page-layout';
import { layGround, type TilesetJson } from './ground';
import { type CampLayout, cornersAround, MAP_HEIGHT, MAP_WIDTH, TILE } from './layout';
import { type Facing, gone, leave, newWalker, randomSpot, step, WALK_SPEED, type Walker } from './wander';

/**
 * The camp scene, drawn with PixiJS (decision 0028): the camp's whole map,
 * scaled up by the largest whole number of device pixels that fits its box,
 * so every art pixel is a square of device pixels at any display scaling
 * (Issue-95), with the ground running on around the map to
 * fill the rest of the box (Issue-89). The heroes are drawn at their own,
 * smaller whole-number scale (Issue-99), so the canvas renders at the scene's
 * scale rather than at the map's pixels enlarged by CSS. Ground
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
  /** Shows these heroes: `arriving` walks out of the hall, `leaving`, no longer listed, walks back in. */
  setHeroes(heroes: readonly SceneHero[], arriving?: string, leaving?: string): void;
  /** Shows each facility at its level, swapping its picture in place when a build changes it (Issue-93). */
  setLevels(levels: Readonly<Partial<Record<FacilityKind, number>>>): void;
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
            await Promise.all(range(WALK_FRAMES).map((i) => Assets.load<Texture>(`${base}/walk-${d}-${i}.png`))),
          ] as const),
        ),
      ) as Record<WalkDirection, Texture[]>;
      const walkFoot = Object.fromEntries(WALK_DIRECTIONS.map((d) => [d, lowestOpaqueRow(must(walk[d][0], `the first ${d} walk frame`))])) as Record<WalkDirection, number>;
      return { still, walk, stillFoot: lowestOpaqueRow(still.south), walkFoot };
    })();
    heroFrames.set(set, frames);
  }
  return frames;
}

/**
 * Shows a frame with its foot row on the sprite's position and its canvas
 * centred there, at `size` of the map's scale; the click area, in the frame's
 * own pixels, shrinks with it.
 */
function show(sprite: Sprite, texture: Texture, foot: number, mirrored: boolean, size: number): void {
  sprite.texture = texture;
  sprite.pivot.set(texture.width / 2, foot + 1);
  sprite.scale.set(mirrored ? -size : size, size);
  sprite.hitArea = new Rectangle(texture.width / 2 - 8, foot - 27, 16, 28);
}

/**
 * Draws the camp in the host element. `levels` says which picture each
 * facility shows: 0 for one the camp has not built, an unfinished building
 * (docs/process/assets.md, rule 17).
 */
/** What the canvas is called, to a screen reader and to the browser test. */
const SCENE_LABEL = 'The camp';

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
  app.canvas.setAttribute('role', 'img');
  app.canvas.setAttribute('aria-label', SCENE_LABEL);
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

  // The box in device pixels, which the browser reports exactly where it
  // can (`device-pixel-content-box`; not Safari, which falls back to the CSS
  // size times the ratio), and in CSS pixels for the canvas's own size.
  const measured = () => ({
    cssWidth: host.clientWidth,
    cssHeight: host.clientHeight,
    width: Math.round(host.clientWidth * window.devicePixelRatio),
    height: Math.round(host.clientHeight * window.devicePixelRatio),
  });
  let box = measured();
  let shown = '';
  let view: SceneView = sceneView(box.width, box.height, window.devicePixelRatio);
  const resize = () => {
    const ratio = window.devicePixelRatio;
    view = sceneView(box.width, box.height, ratio);
    const key = `${box.width}x${box.height}@${ratio}`;
    app.canvas.style.width = `${box.cssWidth}px`;
    app.canvas.style.height = `${box.cssHeight}px`;
    if (key === shown) return;
    shown = key;
    // One canvas pixel per device pixel, the canvas exactly the box, so the
    // browser draws it unscaled: the map's art pixels are scale × scale
    // squares of device pixels, and a hero's, at its own smaller scale, are
    // still whole squares (Issues 95 and 99).
    app.renderer.resize(box.width / view.scale, box.height / view.scale, view.scale);
    world.position.set(view.mapX, view.mapY);
    layWindow(-view.mapX, -view.mapY, view.width, view.height);
  };
  const observer = new ResizeObserver(([entry]) => {
    if (!entry) return;
    const ratio = window.devicePixelRatio;
    const css = entry.contentBoxSize[0];
    // Safari has no devicePixelContentBoxSize, though the DOM types say every browser does.
    const device = 'devicePixelContentBoxSize' in entry ? entry.devicePixelContentBoxSize[0] : undefined;
    const cssWidth = css?.inlineSize ?? entry.contentRect.width;
    const cssHeight = css?.blockSize ?? entry.contentRect.height;
    box = {
      cssWidth,
      cssHeight,
      width: device?.inlineSize ?? Math.round(cssWidth * ratio),
      height: device?.blockSize ?? Math.round(cssHeight * ratio),
    };
    resize();
  });
  try {
    observer.observe(host, { box: 'device-pixel-content-box' });
  } catch {
    observer.observe(host);
  }
  // A change of ratio alone, browser zoom or another screen, may leave the
  // device size as it was; the canvas's CSS size and the heroes' scale follow it.
  let ratioQuery: MediaQueryList | null = null;
  const watchRatio = () => {
    ratioQuery?.removeEventListener('change', onRatio);
    ratioQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    ratioQuery.addEventListener('change', onRatio);
  };
  const onRatio = () => {
    box = measured();
    resize();
    watchRatio();
  };
  watchRatio();
  resize();

  let destroyed = false;

  // Each facility shows the picture of its level, or of the highest level
  // below it that has one (assets.md, rule 17), standing by its base.
  const facilities = new Map<FacilityKind, { sprite: Sprite; art: number }>();
  const picture = async (kind: FacilityKind, level: number) => {
    const art = facilityArtLevel(kind, level);
    const shown = facilities.get(kind);
    if (shown?.art === art) return;
    const texture = await Assets.load<Texture>(`/art/facilities/${kind}/level-${art}.png`);
    const now = facilities.get(kind);
    if (!now || destroyed) return;
    now.art = art;
    now.sprite.texture = texture;
    now.sprite.pivot.set(texture.width / 2, lowestOpaqueRow(texture) + 1);
  };
  for (const spot of layout.facilities) {
    const sprite = new Sprite(Texture.EMPTY);
    facilities.set(spot.kind, { sprite, art: -1 });
    await picture(spot.kind, levels[spot.kind] ?? 1);
    sprite.position.set(spot.at.x, spot.at.y);
    sprite.zIndex = spot.at.y;
    // Every facility opens its panel, as its entry in the menu does (Issue-89).
    sprite.eventMode = 'static';
    sprite.cursor = 'pointer';
    sprite.on('pointertap', () => { callbacks.onFacility(spot.kind); });
    things.addChild(sprite);
  }

  const heroes = new Map<string, HeroOnScreen>();

  app.ticker.add((ticker) => {
    // A hero's size against the map, and its stroll in map pixels, which keeps
    // its stride in step with its frames at that size.
    const size = view.heroScale / view.scale;
    for (const [id, hero] of heroes) {
      const walking = step(hero.walker, ticker.deltaMS, layout.walkable, Math.random, WALK_SPEED * size);
      if (gone(hero.walker)) {
        hero.sprite.destroy();
        heroes.delete(id);
        continue;
      }
      const { facing } = hero.walker;
      if (walking) {
        hero.clockMs += ticker.deltaMS;
        const direction: WalkDirection = facing === 'west' ? 'east' : facing;
        const frame = Math.floor(hero.clockMs / WALK_FRAME_MS) % WALK_FRAMES;
        show(hero.sprite, must(hero.frames.walk[direction][frame], `walk frame ${frame}`), hero.frames.walkFoot[direction], facing === 'west', size);
      } else {
        hero.clockMs = 0;
        show(hero.sprite, hero.frames.still[facing], hero.frames.stillFoot, false, size);
      }
      // On a whole canvas pixel, a device pixel, so every art pixel of the hero covers whole ones.
      hero.sprite.position.set(Math.round(hero.walker.x * view.scale) / view.scale, Math.round(hero.walker.y * view.scale) / view.scale);
      hero.sprite.zIndex = hero.walker.y;
    }
  });

  return {
    setLevels(levels) {
      for (const kind of facilities.keys()) void picture(kind, levels[kind] ?? 1);
    },
    setHeroes(list, arriving, leaving) {
      const wanted = new Set(list.map((h) => h.id));
      for (const [id, hero] of heroes) {
        if (wanted.has(id) || hero.walker.leaving) continue;
        if (id === leaving) {
          // A hero just retired walks back into the hall and is no longer clickable.
          leave(hero.walker, layout.hallDoor);
          hero.sprite.eventMode = 'none';
          hero.sprite.cursor = 'default';
        } else {
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
          sprite.on('pointertap', () => { callbacks.onHero(h.id); });
          things.addChild(sprite);
          heroes.set(h.id, { sprite, walker, frames, clockMs: 0 });
        });
      }
    },
    destroy() {
      destroyed = true;
      observer.disconnect();
      ratioQuery?.removeEventListener('change', onRatio);
      app.destroy(true, { children: true });
    },
  };
}
