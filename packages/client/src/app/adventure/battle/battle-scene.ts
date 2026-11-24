import { clamp, range, uniq } from 'es-toolkit';
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture, TextureStyle } from 'pixi.js';

import {
  ABILITIES,
  ABILITY_EFFECTS,
  type AbilityId,
  type AdventureEvent,
  type Line,
  MONSTER_SPRITE_SETS,
  MONSTERS,
  type MonsterType,
  must,
  PROP_SPRITE_SETS,
  RESOURCE_NODES,
  type ResourceType,
  UNIT_PROFILES,
  type UnitType,
  WEAPON_SPRITES,
} from '@heat/engine';

import { GROUNDS, type GroundSet, layGround, type Terrain, type TilesetJson, TilesetJsonSchema } from '../../camp/scene/ground';
import { fetchJson } from '../../static-json';
import type { CastMember } from '../cast';
import type { Field, FieldUnit } from '../field';
import { effectFrameAt, effectMs, flightMs, flyingAt, followFrame, followMs, heldPoint, leadFrame, nockedAt, releaseMs } from './action-sprites';
import { artSettled } from './art-loads';
import { type EffectArt, type Frames, loadEffectArt, loadGlyphArt, loadIconArt, loadUnitArt, loadWeaponArt, type UnitArt, type UnitArtPath, type WeaponArt } from './battle-art';
import { battleView, type BattleView, entryOffset, spots } from './battle-layout';
import { clipHold } from './clip-hold';
import { AMOUNT_AT, amountRow, DROP_FROM, dropAt, dropTime } from './drop-clip';

/**
 * The battle scene, drawn with PixiJS like the camp (decision 0028): the
 * camp's sprites side-on on a road, at the largest whole scale of
 * device pixels that fits, the ground running on to fill the box. The road
 * is drawn on the ground of the location the run left from, the meadow's
 * for Millbrook's jobs and the crag's for Highcrag's (Issue-352); before any
 * run is handed over it is the meadow's.
 *
 * It draws from the field, where everyone stands and how they are, and
 * animates from the events: as an action resolves, the whole of it in one
 * piece, its act with its weapon beside it, swung in step, each reaching its
 * hold frame, the blow or the release, together; a projectile, where the
 * ability's effect has one, let go then and flown to its target; and at the
 * blow, or where the projectile lands, the ability's effect, a hit and a
 * fall, held; a step up a line or a collapse as a walk; and, where an enemy
 * that fell dropped something, the resource's icon and its amount rising
 * from it and gone (decision 0058, Issue-344), which is all the scene says
 * of a drop: one the party did not get is no event, and shows nothing.
 * The progression reads left to right: the party runs on from the left at
 * the start and walks in place while the road scrolls by on a travel; at a
 * fight or a gather the other side rushes on from the right as the road
 * scrolls with it, and only then does the clock run (the owner's call on
 * Issue-15). What is left of a stage scrolls away on the next travel.
 * Everything it animates plays on the presentation clock, the wall clock
 * times the speed, and nothing a unit is doing stops when the adventure's
 * clock does: the scene says how long that clock should wait for what an
 * action just began (`HOLD_SHARE`, Issue-335, decision 0057), so that one
 * action is animated to its end, the shot, its flight and its strike
 * together, before the next thing happens. A unit whose action is still
 * warming up stands as it stood: the warmup is the engine's time, and
 * nothing of the action is drawn until it happens. The
 * scene knows nothing of the engine or the hub; the page feeds it, and
 * before a run it hands over the run's cast, whose art is loaded before the
 * run is shown (`prepare`, Issue-205).
 */

export interface BattleSceneCallbacks {
  /** Everyone is on after an entry: the clock may run. */
  readonly onEntered: () => void;
}

export interface BattleSceneHandle {
  /**
   * Loads the art of everyone a run may show, their weapons and every
   * ability's effect, and the ground its road is drawn on, before the run is
   * handed over with `reset`. Over when each has arrived or failed, or at
   * the limit; it never fails, and a failure is the page's uncaught error. A
   * ground that fails leaves the road as it was.
   */
  prepare(cast: readonly CastMember[], ground: GroundSet): Promise<void>;
  /** Shows the field as it stands, on the ground prepared last; `enter` runs the party on from the left first. */
  reset(field: Field, heroSets: ReadonlyMap<string, string>, enter: boolean): void;
  /**
   * Animates the events just happened; a fight or a gather beginning brings
   * the other side on. Answers how long the clock should wait for what
   * they began, an action's swing, a projectile's flight, a hit, an effect,
   * a fall and a drop's rise, in presentation time: nothing where they
   * began none.
   */
  feed(events: readonly AdventureEvent[], field: Field): number;
  /** Moves on by `ms` of presentation time, the wall clock times the speed. */
  frame(ms: number, field: Field): void;
  destroy(): void;
}

/**
 * Art pixels a second. One speed for every run and every scroll, the party
 * running on, the road on a travel, the other side rushing on and a retreat,
 * so the progression never changes pace (the owner's call on Issue-15); and
 * a step up a line.
 */
const RUSH_SPEED = 320;
/** The party's run on at the start is no scroll, and goes at four times the pace, so that it is over quickly (the owner's call). */
const RUN_ON_SPEED = 4 * RUSH_SPEED;
const STEP_SPEED = 90;
/** Milliseconds a frame, on the presentation clock. */
const ACT_MS = 90;
const HIT_MS = 70;
const DOWN_MS = 100;
const WALK_MS = 100;
const RUSH_WALK_MS = 50;
const STANCE_MS = 150;
/**
 * The share of an action's animation that the adventure's clock waits for,
 * the swing, a flight, the hit, the effect and a fall (Issue-335): 0 for
 * no wait, 1 for the whole of it, which is the owner's call of 2026-11-20,
 * one action animated at a time. Of the longest clip one frame's events
 * begin, in presentation time, so the wait shortens at 2× and 4× as the
 * clips do. A taste, set by looking; it changes nothing the engine decides.
 */
const HOLD_SHARE = 1;
/** The longest a run waits for its art before it begins, on the wall clock: past it the run begins, and a picture shows when it arrives. */
const ART_WAIT_MS = 8000;
/** A fallen monster or a felled tree lies this long after its fall, then fades over the next. */
const FADE_AFTER_MS = 600;
const FADE_MS = 500;

/**
 * Where a weapon's grip goes, from an actor's feet facing east: its
 * leading hand at the act's hold frame, the same on every set, all made on
 * one skeleton (measured on every hero set, Issue-130: the fist 10 to 13 px
 * ahead of the canvas's centre and 20 px above the feet).
 */
const HAND = { x: 10, y: -20 };

/** The font the scene's digits are drawn in, under `/art/fonts` (assets.md, rule 37). */
const SCENE_FONT = 'scene-01';
/** A drop is drawn over everyone, whatever row they stand on: the stage is not this many rows high. */
const DROP_Z = 1000;

/** The road the units stand on, in the ground's lower terrain: the corner rows from 6 to 10, y 96 to 160 on the stage. */
const ROAD_ROWS = { from: 6, to: 10 };

/** The ground the road is laid with before any run is handed over: the starting location's. */
const START_GROUND: GroundSet = 'meadow-01';

interface UnitView {
  unit: FieldUnit;
  readonly opponent: boolean;
  art: UnitArt | null;
  readonly body: Container;
  readonly picture: Sprite;
  /** The rows above a fading down's cut, drawn with their own alpha. */
  readonly top: Sprite;
  /** The weapon in hand while the unit acts; none for a unit that uses none, such as the wolf. */
  weapon: WeaponArt | null;
  /** A weapon is named for the unit, loaded or not yet. */
  readonly armed: boolean;
  readonly weaponSprite: Sprite;
  readonly bar: Graphics;
  barShown: string;
  /** The health its bar shows until the blow, or the projectile on its way, has landed, where the field already has the hit. */
  barHeld: { readonly health: number; readonly until: number } | null;
  x: number;
  y: number;
  /** How long the engine warms up the action it has declared, which times a projectile's flight; null with none declared. */
  warmup: number | null;
  /**
   * The action it is performing: when it resolved, on the unit's
   * presentation clock, which is when its act began to play, and how long
   * after that its blow lands or its projectile leaves, the moment the act
   * and the weapon have both reached their hold frames.
   */
  act: { readonly from: number; readonly strike: number } | null;
  /** When a hit or a fall begins, on the unit's presentation clock: as the blow or the projectile lands, so still to come while the swing or the flight plays. */
  hitAt: number | null;
  downAt: number | null;
  /** On the presentation clock, for the walk and the stance. */
  clock: number;
  /** No longer in the field: what is left of a stage, scrolled away with the road. */
  behind: boolean;
}

/** An ability's effect playing on whatever its action landed on. */
interface EffectView {
  art: EffectArt | null;
  readonly target: UnitView;
  /** Made for an actor on the left: mirrored when the other side acts. */
  readonly mirrored: boolean;
  /** When it began, on the presentation clock. */
  readonly at: number;
  readonly sprite: Sprite;
}

/**
 * An action's projectile, from its action's resolve to its landing: on the
 * string while a bow is drawn, then let go and in flight from the actor to
 * the target (assets.md, rules 33 and 35; decision 0057). On the
 * presentation clock, as everything is.
 */
interface ProjectileView {
  readonly art: NonNullable<EffectArt['projectile']>;
  readonly actor: UnitView;
  readonly target: UnitView;
  readonly act: NonNullable<UnitView['act']>;
  readonly sprite: Sprite;
  /** When it is let go, on the presentation clock: as its action's act reaches the release. */
  readonly leavesAt: number;
  /** How long it then flies. */
  readonly flight: number;
  /** Where it was let go from, once it has been. */
  from: { readonly x: number; readonly y: number } | null;
}

/** What an enemy dropped, rising from where it fell: the resource's icon and its amount (decision 0058). */
interface DropView {
  /** The enemy that dropped it, which it rises from and is carried with, should the road scroll. */
  readonly from: UnitView;
  /** When it begins, on the presentation clock. */
  readonly at: number;
  /** The icon and the digits of the amount, placed about the icon's middle. */
  readonly picture: Container;
}

/** Where a unit's sprite set is under `/art`: a hero's own set, anyone else's by its type; null where there is none. */
function artPath(kind: FieldUnit['kind'], type: string, heroSet: string | undefined): UnitArtPath | null {
  if (kind === 'hero') return heroSet ? `heroes/${heroSet}` : null;
  if (kind === 'monster') {
    // A stored timeline may name a monster this build no longer has.
    const set = Object.hasOwn(MONSTER_SPRITE_SETS, type) ? MONSTER_SPRITE_SETS[type as MonsterType][0] : undefined;
    return set ? `monsters/${set}` : null;
  }
  const set = PROP_SPRITE_SETS[type as ResourceType]?.[0];
  return set ? `props/${set}` : null;
}

/**
 * The resources a unit of this type may drop, by this build's content: the
 * icons a run is prepared with. A hero drops nothing, and nor does a type
 * that a stored timeline names and this build no longer has.
 */
function dropsOf(kind: FieldUnit['kind'], type: string): readonly string[] {
  if (kind === 'monster' && Object.hasOwn(MONSTERS, type)) return MONSTERS[type as MonsterType].drops.map((drop) => drop.material);
  if (kind === 'resource' && Object.hasOwn(RESOURCE_NODES, type)) return RESOURCE_NODES[type as ResourceType].drops.map((drop) => drop.material);
  return [];
}

/** The weapon by unit type for now; a hero's equipped weapon replaces this lookup (game.md, "Heroes"). */
function weaponOf(kind: FieldUnit['kind'], type: string): string | undefined {
  return kind === 'resource' ? undefined : WEAPON_SPRITES[type as UnitType | MonsterType];
}

/** A hero with no line yet, before its first fight, stands on its unit type's home line. */
function lineOf(unit: FieldUnit): Line {
  return unit.line ?? UNIT_PROFILES[unit.type as UnitType]?.homeLine ?? 'near';
}

const frameOf = (frames: Frames, index: number) => must(frames.textures[clamp(index, 0, frames.textures.length - 1)], 'a frame');

export async function createBattleScene(host: HTMLElement, callbacks: BattleSceneCallbacks): Promise<BattleSceneHandle> {
  TextureStyle.defaultOptions.scaleMode = 'nearest';
  const app = new Application();
  await app.init({ width: 320, height: 180, background: GROUNDS[START_GROUND].backdrop, antialias: false, resolution: 1, roundPixels: true });
  app.canvas.style.imageRendering = 'pixelated';
  app.canvas.style.display = 'block';
  app.canvas.setAttribute('role', 'img');
  app.canvas.setAttribute('aria-label', 'The battle');
  host.appendChild(app.canvas);

  // A ground's tiles, loaded once and kept: the one the road is laid with, and the one the run prepared last asked for.
  const grounds = new Map<GroundSet, Promise<{ readonly set: GroundSet; readonly tileset: TilesetJson; readonly sheet: Texture }>>();
  const groundOf = (set: GroundSet) => {
    let load = grounds.get(set);
    if (!load) {
      load = Promise.all([fetchJson(`/art/ground/${set}/tileset.json`, TilesetJsonSchema), Assets.load<Texture>(`/art/ground/${set}/tileset.png`)]).then(
        ([tileset, sheet]) => ({ set, tileset, sheet }),
      );
      grounds.set(set, load);
    }
    return load;
  };
  let laid = await groundOf(START_GROUND);
  /** The ground the run prepared last asked for, and its tiles once they are in: an earlier run's ground arriving late is not this one's. */
  let wanted: GroundSet = START_GROUND;
  let prepared = laid;
  let { tileset, sheet } = laid;

  // The world in the stage's coordinates: the road, then everyone back to front by the row they stand on.
  const world = new Container();
  const ground = new Container();
  const things = new Container({ sortableChildren: true });
  world.addChild(ground, things);
  app.stage.addChild(world);

  let view: BattleView = battleView(320, 180);
  let scroll = 0;

  /** The road, one column of tiles repeated across the window and one tile more, so that it can scroll by a tile. */
  const layRoad = () => {
    for (const child of ground.removeChildren()) child.destroy();
    const row0 = Math.floor(-view.stageY / 16);
    const rows = Math.ceil((view.height - view.stageY) / 16) - row0;
    const cols = Math.ceil(view.width / 16) + 1;
    const corners = range(rows + 1).map((r): Terrain[] => {
      const row = row0 + r;
      const terrain: Terrain = row >= ROAD_ROWS.from && row <= ROAD_ROWS.to ? 'lower' : 'upper';
      return range(cols + 1).map(() => terrain);
    });
    for (const tile of layGround(tileset, corners)) {
      const sprite = new Sprite(new Texture({ source: sheet.source, frame: new Rectangle(tile.box.x, tile.box.y, tile.box.width, tile.box.height) }));
      sprite.position.set(tile.col * 16, (row0 + tile.row) * 16);
      ground.addChild(sprite);
    }
  };
  const placeRoad = () => {
    ground.x = -view.stageX - (Math.round(scroll) % 16);
  };

  const resize = (deviceWidth: number, deviceHeight: number, cssWidth: number, cssHeight: number) => {
    view = battleView(deviceWidth, deviceHeight);
    app.canvas.style.width = `${cssWidth}px`;
    app.canvas.style.height = `${cssHeight}px`;
    app.renderer.resize(deviceWidth / view.scale, deviceHeight / view.scale, view.scale);
    world.position.set(view.stageX, view.stageY);
    layRoad();
    placeRoad();
  };
  const observer = new ResizeObserver(([entry]) => {
    if (!entry) return;
    const ratio = window.devicePixelRatio;
    const css = entry.contentBoxSize[0];
    // Safari has no devicePixelContentBoxSize, though the DOM types say every browser does.
    const device = 'devicePixelContentBoxSize' in entry ? entry.devicePixelContentBoxSize[0] : undefined;
    const cssWidth = css?.inlineSize ?? entry.contentRect.width;
    const cssHeight = css?.blockSize ?? entry.contentRect.height;
    resize(device?.inlineSize ?? Math.round(cssWidth * ratio), device?.blockSize ?? Math.round(cssHeight * ratio), cssWidth, cssHeight);
  });
  try {
    observer.observe(host, { box: 'device-pixel-content-box' });
  } catch {
    observer.observe(host);
  }
  resize(Math.round(host.clientWidth * window.devicePixelRatio), Math.round(host.clientHeight * window.devicePixelRatio), host.clientWidth, host.clientHeight);

  const units = new Map<string, UnitView>();
  const effects: EffectView[] = [];
  const drops: DropView[] = [];
  /** At most one a unit: its action being animated. */
  const projectiles = new Map<string, ProjectileView>();
  /** The presentation clock, the wall clock times the speed: what an effect plays on. */
  let shown = 0;
  let heroSets: ReadonlyMap<string, string> = new Map();
  /** The party running on from the left, the other side rushing on from the right, or neither. */
  let entering: 'party' | 'opponents' | null = null;
  /** How far right of its spots the other side still is while it rushes on. */
  let offset = 0;
  let destroyed = false;
  // A load's failure is the page's own uncaught error, which is where it always went and where the browser test reads it.
  const failed = (error: unknown) => { reportError(error); };
  /** Hands a unit its art when it arrives: at once for a run that was prepared, since `Assets` keeps a sheet it has loaded. */
  const take = <Art>(art: Promise<Art>, use: (art: Art) => void) => {
    void art.then((arrived) => { if (!destroyed) use(arrived); }, failed);
  };
  // The art in hand, by its set: what a run was prepared with. A unit takes its picture from here in the frame it
  // appears; asked of `Assets`, even a sheet already loaded arrives a frame late, and its health bar stands alone in that one.
  const unitArt = new Map<string, UnitArt>();
  const weaponArt = new Map<string, WeaponArt>();
  const unitArtOf = async (path: UnitArtPath) => {
    const art = await loadUnitArt(path);
    unitArt.set(path, art);
    return art;
  };
  const weaponArtOf = async (set: string) => {
    const art = await loadWeaponArt(set);
    weaponArt.set(set, art);
    return art;
  };
  // An effect's too: its length is what the clock's wait is a share of, read in the frame its action resolves.
  const effectArt = new Map<string, EffectArt>();
  const effectArtOf = async (set: string) => {
    const art = await loadEffectArt(set);
    effectArt.set(set, art);
    return art;
  };
  // A drop's: the icon of each resource the cast may drop, and the digits. A drop is drawn only with an icon in hand.
  const iconArt = new Map<string, Texture>();
  const iconArtOf = async (material: string) => {
    const art = await loadIconArt(material);
    iconArt.set(material, art);
    return art;
  };
  let glyphArt: ReadonlyMap<string, Texture> = new Map();
  const glyphArtOf = async () => {
    glyphArt = await loadGlyphArt(SCENE_FONT);
  };

  const addUnit = (unit: FieldUnit): UnitView => {
    const body = new Container();
    const picture = new Sprite();
    const top = new Sprite();
    top.visible = false;
    const weaponSprite = new Sprite();
    weaponSprite.visible = false;
    const bar = new Graphics();
    body.addChild(picture, top, weaponSprite);
    things.addChild(body, bar);
    const weapon = weaponOf(unit.kind, unit.type);
    const unitView: UnitView = {
      unit,
      opponent: unit.side === 'opponents',
      art: null,
      body,
      picture,
      top,
      weapon: null,
      armed: weapon !== undefined,
      weaponSprite,
      bar,
      barShown: '',
      barHeld: null,
      x: 0,
      y: 0,
      warmup: null,
      act: null,
      hitAt: null,
      downAt: null,
      clock: 0,
      behind: false,
    };
    const path = artPath(unit.kind, unit.type, heroSets.get(unit.unitId));
    // A unit that was not in the run's cast loads now, and shows when its picture arrives.
    if (path) {
      unitView.art = unitArt.get(path) ?? null;
      if (!unitView.art) take(unitArtOf(path), (art) => { unitView.art = art; });
    }
    if (weapon) {
      unitView.weapon = weaponArt.get(weapon) ?? null;
      if (!unitView.weapon) take(weaponArtOf(weapon), (art) => { unitView.weapon = art; });
    }
    for (const material of dropsOf(unit.kind, unit.type)) if (!iconArt.has(material)) void iconArtOf(material).catch(failed);
    units.set(unit.unitId, unitView);
    return unitView;
  };

  const removeDrop = (drop: DropView) => {
    drops.splice(drops.indexOf(drop), 1);
    drop.picture.destroy({ children: true });
  };

  /**
   * Readies the picture of what an enemy dropped, to begin `delay` from now:
   * the resource's icon, and on its lower right the amount, a sprite a
   * digit. Nothing for a resource whose icon is not in hand, which is one
   * this build does not know: the party's panel still counts it.
   */
  const addDrop = (from: UnitView, material: string, amount: number, delay: number): boolean => {
    const icon = iconArt.get(material);
    if (!icon) return false;
    const picture = new Container();
    picture.visible = false;
    picture.zIndex = DROP_Z + drops.length;
    const sprite = new Sprite(icon);
    sprite.anchor.set(0.5);
    picture.addChild(sprite);
    for (const { digit, x } of amountRow(amount, (glyph) => glyphArt.get(glyph)?.width).digits) {
      const glyph = new Sprite(must(glyphArt.get(digit), `the glyph ${digit}`));
      glyph.position.set(AMOUNT_AT.x + x, AMOUNT_AT.y);
      picture.addChild(glyph);
    }
    things.addChild(picture);
    drops.push({ from, at: shown + delay, picture });
    return true;
  };

  /** Shows each drop where it has risen to above its enemy, and lets go of those gone, or whose enemy has left the scene. */
  const drawDrops = () => {
    for (const drop of [...drops]) {
      const { from, picture } = drop;
      const since = shown - drop.at;
      const at = dropAt(since);
      if (units.get(from.unit.unitId) !== from || (since >= 0 && !at)) {
        removeDrop(drop);
        continue;
      }
      picture.visible = at !== null;
      if (!at) continue;
      picture.position.set(Math.round(from.x), Math.round(from.y) - DROP_FROM - at.lift);
      picture.alpha = at.alpha;
    }
  };

  const removeEffect = (effect: EffectView) => {
    effects.splice(effects.indexOf(effect), 1);
    effect.sprite.destroy();
  };

  /**
   * Starts an ability's effect on the unit its action landed on, `delay`
   * from now, when the blow or the projectile reaches it, and answers how
   * long it lasts: nothing for one whose art is not in hand yet.
   */
  const addEffect = (set: string, target: UnitView, mirrored: boolean, delay: number): number => {
    const sprite = new Sprite();
    sprite.visible = false;
    things.addChild(sprite);
    const effect: EffectView = { art: effectArt.get(set) ?? null, target, mirrored, at: shown + delay, sprite };
    effects.push(effect);
    if (effect.art) return effectMs(effect.art.layout);
    void effectArtOf(set).then((art) => {
      if (!destroyed) effect.art = art;
    });
    return 0;
  };

  const removeProjectile = (unitId: string) => {
    projectiles.get(unitId)?.sprite.destroy();
    projectiles.delete(unitId);
  };

  /**
   * Readies an ability's projectile for the action that just resolved, to
   * leave `strike` from now and fly for `flight`; an effect with none, a
   * swing or a bite, makes nothing, and nor does one whose art is not in hand.
   */
  const addProjectile = (set: string, actor: UnitView, target: UnitView, act: NonNullable<UnitView['act']>, flight: number): boolean => {
    const { unitId } = actor.unit;
    removeProjectile(unitId);
    const art = effectArt.get(set)?.projectile;
    if (!art) return false;
    const sprite = new Sprite();
    sprite.visible = false;
    sprite.anchor.set(0, 0.5);
    things.addChild(sprite);
    projectiles.set(unitId, { art, actor, target, act, sprite, leavesAt: shown + act.strike, flight, from: null });
    return true;
  };

  /** A unit has fallen once its fall has begun: one a blow or a projectile has still to reach stands until it lands. */
  const fallen = (unitView: UnitView) => unitView.downAt !== null && unitView.clock >= unitView.downAt;

  /** Whoever lets a projectile go, for the arithmetic of where it is held and let go from. */
  const thrower = (actor: UnitView) => ({ feet: actor, facing: actor.opponent ? -1 : 1, hand: HAND, weapon: actor.weapon }) as const;

  /**
   * Shows each projectile: on the bow's string while the bow is drawn, then,
   * let go as the act reaches its release, along its flight; landed, gone.
   * One whose target fell or was left behind with the stage is dropped, and
   * so is one not yet let go whose actor fell or began something else.
   */
  const drawProjectiles = () => {
    for (const [unitId, projectile] of [...projectiles]) {
      const { art, actor, target, act, sprite } = projectile;
      const left = (unit: UnitView) => unit.behind || units.get(unit.unit.unitId) !== unit;
      const flying = shown >= projectile.leavesAt;
      if (left(actor) || left(target) || fallen(target) || (!flying && (actor.act !== act || fallen(actor)))) {
        removeProjectile(unitId);
        continue;
      }
      sprite.visible = false;
      const from = thrower(actor);
      const { weapon } = actor;
      let at: { x: number; y: number; frame: number } | null;
      if (flying) {
        // Let go from where the hand, or the bow's string, is at the release.
        projectile.from ??= heldPoint(from, weapon ? weapon.holdFrame : null);
        at = flyingAt(shown - projectile.leavesAt, projectile.flight, projectile.from, from.facing, target, art.layout);
        // Landed: what it does to its target begins now.
        if (!at) {
          removeProjectile(unitId);
          continue;
        }
      } else {
        // On the string, at the frame the bow shows; nothing in a hand about to throw.
        at = weapon ? nockedAt(from, actFrame(actor, weapon.holdFrame, weapon.swing.length, weapon.frameMs)) : null;
        if (!at) continue;
      }
      sprite.texture = must(art.frames[at.frame], `frame ${at.frame} of the projectile`);
      sprite.scale.set(from.facing, 1);
      sprite.position.set(at.x, at.y);
      sprite.zIndex = Math.max(actor.y, target.y) + 0.45;
      sprite.visible = true;
    }
  };

  /** Shows each effect's frame on its target's feet, and lets go of those over. */
  const drawEffects = () => {
    for (const effect of [...effects]) {
      const { art, target, sprite } = effect;
      if (!units.has(target.unit.unitId)) {
        removeEffect(effect);
        continue;
      }
      if (!art) continue;
      const index = effectFrameAt(art.layout, shown - effect.at);
      if (index === null) {
        removeEffect(effect);
        continue;
      }
      sprite.visible = index >= 0;
      if (index < 0) continue;
      const { offset } = art.layout;
      sprite.texture = must(art.frames[index], `frame ${index} of the effect`);
      sprite.scale.set(effect.mirrored ? -1 : 1, 1);
      sprite.position.set(Math.round(target.x) + (effect.mirrored ? -offset.x : offset.x), Math.round(target.y) + offset.y);
      sprite.zIndex = target.y + 0.4;
    }
  };

  const removeUnit = (id: string) => {
    const unitView = units.get(id);
    if (!unitView) return;
    unitView.body.destroy({ children: true });
    unitView.bar.destroy();
    units.delete(id);
  };

  /** Everyone's spot from the field: the living and the fallen keep the line they had. */
  const targets = (field: Field) =>
    spots([...field.party, ...field.opponents].map((u) => ({ unitId: u.unitId, side: u.side, line: lineOf(u) })));

  /** Brings the views in step with the field: new units added, units no longer in it left behind. */
  const sync = (field: Field) => {
    const present = new Set<string>();
    for (const unit of [...field.party, ...field.opponents]) {
      present.add(unit.unitId);
      const unitView = units.get(unit.unitId) ?? addUnit(unit);
      unitView.unit = unit;
    }
    for (const unitView of units.values()) if (!present.has(unitView.unit.unitId)) unitView.behind = true;
  };

  /**
   * Keeps a unit's bar where it was until the blow, or the projectile, now
   * on its way has landed. Where one is already awaited, the bar keeps the
   * health it showed and waits for the later of the two; a blow that lands
   * at once takes its own damage off what the bar is showing.
   */
  const holdBar = (target: UnitView, before: number, delay: number, amount: number) => {
    const held = target.barHeld && target.clock < target.barHeld.until ? target.barHeld : null;
    if (delay > 0) target.barHeld = { health: held?.health ?? before, until: Math.max(held?.until ?? 0, target.clock + delay) };
    else if (held) target.barHeld = { health: Math.max(0, held.health - amount), until: held.until };
  };

  const drawBar = (unitView: UnitView) => {
    const { unit } = unitView;
    if (unitView.barHeld && unitView.clock >= unitView.barHeld.until) unitView.barHeld = null;
    // The field has a hit as soon as its action resolves; the bar shows it as the projectile lands.
    const health = unitView.barHeld?.health ?? unit.health;
    const shown = unit.kind === 'resource' || health <= 0 || unitView.behind ? '' : `${health}/${unit.maxHealth}`;
    unitView.bar.position.set(Math.round(unitView.x) - 7, Math.round(unitView.y) + 2);
    unitView.bar.zIndex = unitView.y + 0.5;
    if (shown === unitView.barShown) return;
    unitView.barShown = shown;
    unitView.bar.clear();
    if (!shown) return;
    const share = health / unit.maxHealth;
    const fill = Math.max(1, Math.round(14 * share));
    unitView.bar.rect(0, 0, 14, 2).fill(0x140d08);
    unitView.bar.rect(0, 0, fill, 2).fill(share > 0.5 ? 0x6fbf4a : share > 0.25 ? 0xd9a441 : 0xc0392b);
  };

  /** Shows one frame, standing on `foot`, mirrored for the other side or a retreat. */
  const show = (unitView: UnitView, frames: Frames, index: number, mirrored: boolean, fade: number | null = null) => {
    const texture = frameOf(frames, index);
    const { picture, top, body } = unitView;
    body.position.set(Math.round(unitView.x), Math.round(unitView.y));
    body.scale.set(mirrored ? -1 : 1, 1);
    body.zIndex = unitView.y;
    const cut = unitView.art?.fadeAbove ?? null;
    if (fade === null || cut === null || cut <= 0) {
      picture.texture = texture;
      picture.pivot.set(texture.width / 2, frames.foot + 1);
      top.visible = false;
      return;
    }
    // A fading down: the rows above the cut with their own alpha, the rest as drawn (rule 30), each cut from the frame's place on its sheet.
    const { source, frame } = texture;
    top.texture = new Texture({ source, frame: new Rectangle(frame.x, frame.y, texture.width, cut) });
    top.pivot.set(texture.width / 2, frames.foot + 1);
    top.alpha = fade;
    top.visible = true;
    picture.texture = new Texture({ source, frame: new Rectangle(frame.x, frame.y + cut, texture.width, texture.height - cut) });
    picture.pivot.set(texture.width / 2, frames.foot + 1 - cut);
  };

  /**
   * The frame of a unit's act, or of its weapon's swing, on the unit's
   * presentation clock, from the moment its action resolved: up to its hold
   * frame, waiting there until the act and the weapon are both at theirs,
   * the blow or the release, and the rest from then. Null outside an act.
   */
  const actFrame = (unitView: UnitView, hold: number, count: number, lead?: readonly number[]) => {
    const { act } = unitView;
    if (!act) return null;
    const ms = unitView.clock - act.from;
    return ms < act.strike ? leadFrame(ms, hold, count, ACT_MS, lead) : followFrame(ms - act.strike, hold, count, ACT_MS);
  };

  /** The weapon in hand at the act's frame, its grip on the hand, or none outside an act. */
  const drawWeapon = (unitView: UnitView) => {
    const { weapon, weaponSprite } = unitView;
    const index = weapon && !fallen(unitView) ? actFrame(unitView, weapon.holdFrame, weapon.swing.length, weapon.frameMs) : null;
    weaponSprite.visible = index !== null;
    if (index === null || !weapon) return;
    const grip = must(weapon.grips[index], `grip ${index} of the weapon`);
    weaponSprite.texture = must(weapon.swing[index], `frame ${index} of the weapon`);
    weaponSprite.position.set(HAND.x - grip.x, HAND.y - grip.y);
  };

  const draw = (unitView: UnitView, moving: boolean, rushing: boolean, mirrored: boolean) => {
    const art = unitView.art;
    drawWeapon(unitView);
    if (!art) return;
    if (unitView.downAt !== null && fallen(unitView)) {
      const last = art.down.textures.length - 1;
      const since = unitView.clock - unitView.downAt;
      const index = Math.min(last, Math.floor(since / DOWN_MS));
      show(unitView, art.down, index, mirrored, last > 0 ? 1 - index / last : null);
      // A fallen monster or a felled tree lies a moment, then fades away; a fallen hero stays down.
      if (unitView.unit.kind !== 'hero') {
        unitView.body.alpha = clamp(1 - (since - last * DOWN_MS - FADE_AFTER_MS) / FADE_MS, 0, 1);
      }
      return;
    }
    if (unitView.act) {
      const index = actFrame(unitView, art.actHold, art.act.textures.length);
      if (index !== null) {
        show(unitView, art.act, index, mirrored);
        return;
      }
      unitView.act = null;
      unitView.weaponSprite.visible = false;
    }
    if (unitView.hitAt !== null && unitView.clock >= unitView.hitAt) {
      const index = Math.floor((unitView.clock - unitView.hitAt) / HIT_MS);
      if (index < art.hit.textures.length) {
        show(unitView, art.hit, index, mirrored);
        return;
      }
      unitView.hitAt = null;
    }
    // The walk and the stance loop; the act, the hit and the fall above stop at their last frame.
    const loop = (frames: Frames, frameMs: number) => Math.floor(unitView.clock / frameMs) % frames.textures.length;
    if (moving) show(unitView, art.walk, loop(art.walk, rushing ? RUSH_WALK_MS : WALK_MS), mirrored);
    else show(unitView, art.stance, loop(art.stance, STANCE_MS), mirrored);
  };

  return {
    prepare(cast, ground) {
      wanted = ground;
      const road = groundOf(ground).then((arrived) => {
        if (arrived.set === wanted) prepared = arrived;
      });
      const sets = uniq(cast.flatMap((member) => artPath(member.kind, member.type, member.spriteSet) ?? []));
      const weapons = uniq(cast.flatMap((member) => weaponOf(member.kind, member.type) ?? []));
      const effectSets = uniq(Object.values(ABILITY_EFFECTS));
      const icons = uniq(cast.flatMap((member) => dropsOf(member.kind, member.type)));
      return artSettled(
        [
          ...sets.map((path) => unitArtOf(path)),
          ...weapons.map((set) => weaponArtOf(set)),
          ...effectSets.map((set) => effectArtOf(set)),
          ...icons.map((material) => iconArtOf(material)),
          glyphArtOf(),
          road,
        ],
        ART_WAIT_MS,
        failed,
      );
    },

    reset(field, sets, enter) {
      heroSets = sets;
      if (prepared !== laid) {
        laid = prepared;
        ({ tileset, sheet } = laid);
        app.renderer.background.color = GROUNDS[laid.set].backdrop;
        layRoad();
        placeRoad();
      }
      for (const effect of [...effects]) removeEffect(effect);
      for (const drop of [...drops]) removeDrop(drop);
      for (const id of [...projectiles.keys()]) removeProjectile(id);
      for (const id of [...units.keys()]) removeUnit(id);
      scroll = 0;
      offset = 0;
      sync(field);
      const at = targets(field);
      // Running on, the party keeps its order and starts with its front hero just beyond the window's left edge.
      const front = Math.max(...field.party.map((u) => must(at.get(u.unitId), `the spot of ${u.unitId}`).x));
      const runOn = front + view.stageX + 16;
      for (const unitView of units.values()) {
        const spot = must(at.get(unitView.unit.unitId), `the spot of ${unitView.unit.unitId}`);
        unitView.y = spot.y;
        unitView.x = enter && !unitView.opponent ? spot.x - runOn : spot.x;
        if (unitView.unit.health <= 0) unitView.downAt = -Infinity;
      }
      entering = enter ? 'party' : null;
      if (!enter) placeRoad();
    },

    feed(events, field) {
      const beginning = events.find((e) => e.kind === 'stage-start' && (e.stageKind === 'fight' || e.stageKind === 'gather'));
      if (beginning) {
        // What is left of the last stage scrolls away as the new one comes on, and the party,
        // its last act or hit done, walks to meet the next while the clock waits.
        for (const unitView of units.values()) {
          if (unitView.opponent) unitView.behind = true;
          else {
            unitView.act = null;
            unitView.warmup = null;
            unitView.hitAt = null;
          }
        }
      }
      // Each unit's health before these events, for a bar that waits for the blow or the projectile to land.
      const healthBefore = new Map([...units].map(([id, unitView]) => [id, unitView.unit.health]));
      sync(field);
      if (beginning) {
        const at = targets(field);
        const fresh = field.opponents.map((u) => must(units.get(u.unitId), `the view of ${u.unitId}`)).filter((v) => !v.behind);
        offset = entryOffset(fresh.map((v) => must(at.get(v.unit.unitId), `the spot of ${v.unit.unitId}`).x));
        for (const unitView of fresh) {
          const spot = must(at.get(unitView.unit.unitId), `the spot of ${unitView.unit.unitId}`);
          unitView.x = spot.x + offset;
          unitView.y = spot.y;
        }
        entering = 'opponents';
      }
      // How long each thing these events begin lasts, from now, for the clock's wait: a unit whose art is not in hand yet shows none, and waits for none.
      const clips: number[] = [];
      // How long until the blow, or the projectile, on its way to each unit lands, for a fall these same events bring.
      const landing = new Map<string, number>();
      // How many drops of each enemy these events have shown, for the stagger of one that drops more than one thing.
      const dropped = new Map<string, number>();
      for (const event of events) {
        if (event.kind === 'action-declared') {
          // Nothing is drawn for an action until it happens; its warmup is kept, because it times a projectile's flight.
          const unitView = units.get(event.unitId);
          if (unitView) unitView.warmup = event.resolveTimestamp - event.timestamp;
        } else if (event.kind === 'action-resolved') {
          const set = ABILITY_EFFECTS[event.abilityId as AbilityId];
          const actor = units.get(event.unitId);
          // The action happens now, and the whole of it plays from here: the act and its weapon up to the blow or the
          // release, a projectile's flight, and then what it does to whoever it reached. All of it is waited for.
          let delay = 0;
          if (actor?.art && event.abilityId !== 'move-up') {
            const { art, weapon } = actor;
            const strike = Math.max(releaseMs(art.actHold, ACT_MS), weapon ? releaseMs(weapon.holdFrame, ACT_MS, weapon.frameMs) : 0);
            actor.act = { from: actor.clock, strike };
            clips.push(strike + followMs(art.actHold, art.act.textures.length, ACT_MS));
            delay = strike;
            // A projectile flies at whoever took the hit, as long as decision 0052 timed it: what the warmup left after the wind-up.
            const struck = event.effects.find((effect) => effect.kind === 'damage');
            const target = units.get(struck?.targetId ?? event.targetIds[0] ?? '');
            // Declared before the scene was reset, as on a resume, its warmup was not seen: the ability's own stands in.
            const warmup = actor.warmup ?? (Object.hasOwn(ABILITIES, event.abilityId) ? ABILITIES[event.abilityId as AbilityId].warmupMs : 0);
            const flight = flightMs(warmup, strike);
            if (set && target && target !== actor && flight > 0 && addProjectile(set, actor, target, actor.act, flight)) delay += flight;
          } else removeProjectile(event.unitId);
          if (actor) actor.warmup = null;
          clips.push(delay);
          for (const effect of event.effects) {
            if (effect.kind === 'damage') {
              const target = units.get(effect.targetId);
              if (target) {
                // Two blows on one unit in a frame: it falls as the later of them lands.
                landing.set(effect.targetId, Math.max(landing.get(effect.targetId) ?? 0, delay));
                holdBar(target, healthBefore.get(effect.targetId) ?? target.unit.health, delay, effect.amount);
                if (effect.newHealth > 0) {
                  target.hitAt = target.clock + delay;
                  if (target.art) clips.push(delay + target.art.hit.textures.length * HIT_MS);
                }
              }
            }
            // The effect lands on whoever the action reached: a guard that took a hit, not the ally it covered.
            if (set && effect.kind !== 'move') {
              const target = units.get(effect.targetId);
              if (target) clips.push(delay + addEffect(set, target, actor?.opponent ?? false, delay));
            }
          }
        } else if (event.kind === 'unit-down') {
          const unitView = units.get(event.unitId);
          if (unitView) {
            const delay = landing.get(event.unitId) ?? 0;
            unitView.downAt = unitView.clock + delay;
            // The fall alone: the while it lies and its fading are not waited for.
            if (unitView.art) clips.push(delay + unitView.art.down.textures.length * DOWN_MS);
          }
        } else if (event.kind === 'drop') {
          // What the enemy dropped rises as it falls, with the blow or the projectile that felled it, and the clock waits for the rise too.
          const unitView = units.get(event.unitId);
          const index = dropped.get(event.unitId) ?? 0;
          const time = dropTime(index, landing.get(event.unitId) ?? 0);
          if (unitView && addDrop(unitView, event.material, event.amount, time.from)) {
            dropped.set(event.unitId, index + 1);
            clips.push(time.until);
          }
        }
      }
      return clipHold(clips, HOLD_SHARE);
    },

    frame(ms, field) {
      shown += ms;
      const at = targets(field);
      const travelling = entering === null && field.outcome === null && field.stageKind === 'travel';
      const retreating = field.outcome === 'retreat';
      let rolled = 0;
      if (entering === 'opponents') {
        const step = Math.min(offset, (RUSH_SPEED * ms) / 1000);
        offset -= step;
        rolled = step;
      } else if (travelling) {
        rolled = (RUSH_SPEED * ms) / 1000;
      }
      scroll += rolled;
      placeRoad();

      let partyOn = true;
      for (const unitView of [...units.values()]) {
        unitView.clock += ms;
        // Upright: alive, or struck down by a projectile that has not landed yet.
        const standing = !fallen(unitView) && (unitView.unit.health > 0 || unitView.downAt !== null);
        if (unitView.behind) {
          unitView.x -= rolled;
          if (unitView.x < -view.stageX - 48) {
            removeUnit(unitView.unit.unitId);
            continue;
          }
          draw(unitView, false, false, unitView.opponent);
          drawBar(unitView);
          continue;
        }
        const spot = must(at.get(unitView.unit.unitId), `the spot of ${unitView.unit.unitId}`);
        let moving = false;
        let rushing: boolean;
        let mirrored = unitView.opponent;
        if (unitView.opponent && entering === 'opponents') {
          unitView.x = spot.x + offset;
          unitView.y = spot.y;
          moving = offset > 0;
          rushing = true;
        } else if (!unitView.opponent && retreating && standing) {
          // A retreat: the party turns and runs off to the left.
          unitView.x -= RUSH_SPEED * (ms / 1000);
          moving = true;
          rushing = true;
          mirrored = true;
        } else {
          const speed = entering === 'party' ? RUN_ON_SPEED : STEP_SPEED;
          const dx = spot.x - unitView.x;
          const dy = spot.y - unitView.y;
          const distance = Math.hypot(dx, dy);
          const step = (speed * ms) / 1000;
          if (distance > step) {
            unitView.x += (dx / distance) * step;
            unitView.y += (dy / distance) * step;
            moving = standing;
            if (entering === 'party' && !unitView.opponent) partyOn = false;
          } else {
            unitView.x = spot.x;
            unitView.y = spot.y;
          }
          rushing = entering === 'party';
          // The party walks in place while the road goes by.
          if (!unitView.opponent && standing && (travelling || entering === 'opponents')) {
            moving = true;
            rushing = true;
          }
        }
        draw(unitView, moving, rushing, mirrored);
        drawBar(unitView);
      }

      drawProjectiles();
      drawEffects();
      drawDrops();

      if ((entering === 'party' && partyOn) || (entering === 'opponents' && offset <= 0)) {
        entering = null;
        callbacks.onEntered();
      }
    },

    destroy() {
      destroyed = true;
      observer.disconnect();
      app.destroy(true, { children: true });
    },
  };
}
