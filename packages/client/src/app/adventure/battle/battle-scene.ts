import { clamp, range } from 'es-toolkit';
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture, TextureStyle } from 'pixi.js';

import {
  ABILITY_EFFECTS,
  type AbilityId,
  type AdventureEvent,
  type Line,
  MONSTER_SPRITE_SETS,
  type MonsterType,
  must,
  PROP_SPRITE_SETS,
  type ResourceType,
  UNIT_PROFILES,
  type UnitType,
  WEAPON_SPRITES,
} from '@heat/engine';

import { layGround, type Terrain, TilesetJsonSchema } from '../../camp/scene/ground';
import { fetchJson } from '../../static-json';
import type { Field, FieldUnit } from '../field';
import { effectFrameAt, flightAt, flightPoint, heldFrame, releaseMs } from './action-sprites';
import { type EffectArt, type Frames, loadEffectArt, loadUnitArt, loadWeaponArt, type UnitArt, type WeaponArt } from './battle-art';
import { battleView, type BattleView, entryOffset, spots } from './battle-layout';

/**
 * The battle scene, drawn with PixiJS like the camp (decision 0028): the
 * camp's sprites side-on on a meadow road, at the largest whole scale of
 * device pixels that fits, the ground running on to fill the box.
 *
 * It draws from the field, where everyone stands and how they are, and
 * animates from the events: an action's act, held on its hold frame until
 * it resolves, with its weapon beside it, swung in step and held on its own
 * hold frame; a projectile, where the ability's effect has one, let go at
 * the hold frame and landing as the action resolves; the ability's effect on
 * whatever the action lands on; a hit; a fall, held; a step up a line or a
 * collapse as a walk.
 * The progression reads left to right: the party runs on from the left at
 * the start and walks in place while the road scrolls by on a travel; at a
 * fight or a gather the other side rushes on from the right as the road
 * scrolls with it, and only then does the clock run (the owner's call on
 * Issue-15). What is left of a stage scrolls away on the next travel. The
 * scene knows nothing of the engine or the hub; the page feeds it.
 */

export interface BattleSceneCallbacks {
  /** Everyone is on after an entry: the clock may run. */
  readonly onEntered: () => void;
}

export interface BattleSceneHandle {
  /** Shows the field as it stands; `enter` runs the party on from the left first. */
  reset(field: Field, heroSets: ReadonlyMap<string, string>, enter: boolean): void;
  /** Animates the events just happened; a fight or a gather beginning brings the other side on. */
  feed(events: readonly AdventureEvent[], field: Field): void;
  /** Moves on by `ms` of presentation time, the wall clock times the speed, with the clock at `simTime`. */
  frame(ms: number, simTime: number, field: Field): void;
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
/** Milliseconds a frame: on the clock for an act, a hit and a fall; on the presentation clock for a walk and the stance. */
const ACT_MS = 90;
const HIT_MS = 70;
const DOWN_MS = 100;
const WALK_MS = 100;
const RUSH_WALK_MS = 50;
const STANCE_MS = 150;
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

/** The road the units stand on, in the ground's lower terrain: the corner rows from 6 to 10, y 96 to 160 on the stage. */
const ROAD_ROWS = { from: 6, to: 10 };

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
  readonly weaponSprite: Sprite;
  readonly bar: Graphics;
  barShown: string;
  x: number;
  y: number;
  act: { readonly from: number; readonly resolve: number } | null;
  /** When a hit or a fall began, on the unit's presentation clock, so that one still plays once the adventure's clock has stopped. */
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
 * An action's projectile, from its declaration to its landing: on the
 * string while a bow is drawn, then in flight from the actor to the target
 * (assets.md, rules 33 and 35). On the adventure's clock, as the act is.
 */
interface ProjectileView {
  art: EffectArt | null;
  readonly actor: UnitView;
  readonly target: UnitView;
  readonly act: { readonly from: number; readonly resolve: number };
  readonly sprite: Sprite;
}

function artPath(unit: FieldUnit, heroSets: ReadonlyMap<string, string>): string | null {
  if (unit.kind === 'hero') {
    const set = heroSets.get(unit.unitId);
    return set ? `heroes/${set}` : null;
  }
  if (unit.kind === 'monster') {
    const set = MONSTER_SPRITE_SETS[unit.type as MonsterType][0];
    return set ? `monsters/${set}` : null;
  }
  const set = PROP_SPRITE_SETS[unit.type as ResourceType]?.[0];
  return set ? `props/${set}` : null;
}

/** A hero with no line yet, before its first fight, stands on its unit type's home line. */
function lineOf(unit: FieldUnit): Line {
  return unit.line ?? UNIT_PROFILES[unit.type as UnitType]?.homeLine ?? 'near';
}

const frameOf = (frames: Frames, index: number) => must(frames.textures[clamp(index, 0, frames.textures.length - 1)], 'a frame');

export async function createBattleScene(host: HTMLElement, callbacks: BattleSceneCallbacks): Promise<BattleSceneHandle> {
  TextureStyle.defaultOptions.scaleMode = 'nearest';
  const app = new Application();
  await app.init({ width: 320, height: 180, background: '#4f7f2a', antialias: false, resolution: 1, roundPixels: true });
  app.canvas.style.imageRendering = 'pixelated';
  app.canvas.style.display = 'block';
  app.canvas.setAttribute('role', 'img');
  app.canvas.setAttribute('aria-label', 'The battle');
  host.appendChild(app.canvas);

  const tileset = await fetchJson('/art/ground/meadow-01/tileset.json', TilesetJsonSchema);
  const sheet = await Assets.load<Texture>('/art/ground/meadow-01/tileset.png');

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
  /** At most one a unit: its action in warmup. */
  const projectiles = new Map<string, ProjectileView>();
  /** The presentation clock, the wall clock times the speed: what an effect plays on. */
  let shown = 0;
  let heroSets: ReadonlyMap<string, string> = new Map();
  /** The party running on from the left, the other side rushing on from the right, or neither. */
  let entering: 'party' | 'opponents' | null = null;
  /** How far right of its spots the other side still is while it rushes on. */
  let offset = 0;
  let destroyed = false;

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
    const unitView: UnitView = {
      unit,
      opponent: unit.side === 'opponents',
      art: null,
      body,
      picture,
      top,
      weapon: null,
      weaponSprite,
      bar,
      barShown: '',
      x: 0,
      y: 0,
      act: null,
      hitAt: null,
      downAt: null,
      clock: 0,
      behind: false,
    };
    const path = artPath(unit, heroSets);
    if (path) {
      void loadUnitArt(path).then((art) => {
        if (!destroyed) unitView.art = art;
      });
    }
    // The weapon by unit type for now; a hero's equipped weapon replaces this lookup (game.md, "Heroes").
    const weapon = unit.kind === 'resource' ? undefined : WEAPON_SPRITES[unit.type as UnitType | MonsterType];
    if (weapon) {
      void loadWeaponArt(weapon).then((art) => {
        if (!destroyed) unitView.weapon = art;
      });
    }
    units.set(unit.unitId, unitView);
    return unitView;
  };

  const removeEffect = (effect: EffectView) => {
    effects.splice(effects.indexOf(effect), 1);
    effect.sprite.destroy();
  };

  /** Starts an ability's effect on the unit its action landed on. */
  const addEffect = (set: string, target: UnitView, mirrored: boolean) => {
    const sprite = new Sprite();
    sprite.visible = false;
    things.addChild(sprite);
    const effect: EffectView = { art: null, target, mirrored, at: shown, sprite };
    effects.push(effect);
    void loadEffectArt(set).then((art) => {
      if (!destroyed) effect.art = art;
    });
  };

  const removeProjectile = (unitId: string) => {
    projectiles.get(unitId)?.sprite.destroy();
    projectiles.delete(unitId);
  };

  /** Readies an ability's projectile for the action just declared; an effect with none leaves nothing to draw. */
  const addProjectile = (set: string, actor: UnitView, target: UnitView, act: { readonly from: number; readonly resolve: number }) => {
    removeProjectile(actor.unit.unitId);
    const sprite = new Sprite();
    sprite.visible = false;
    sprite.anchor.set(0, 0.5);
    things.addChild(sprite);
    const projectile: ProjectileView = { art: null, actor, target, act, sprite };
    projectiles.set(actor.unit.unitId, projectile);
    void loadEffectArt(set).then((art) => {
      if (!destroyed) projectile.art = art;
    });
  };

  /**
   * Shows each projectile where it is at `simTime`: before its release on
   * the bow's nock, its tail on the string (the owner's note on Issue-284);
   * from the release, the moment the weapon or, for a unit with none, the
   * act reaches its hold frame, along its flight; landed, gone.
   */
  const drawProjectiles = (simTime: number) => {
    for (const [unitId, projectile] of [...projectiles]) {
      const { actor, target, act, sprite } = projectile;
      const flying = projectile.art?.projectile;
      // An actor that fell in its warmup, or was left behind with the stage, never lets go.
      if (actor.act !== act || actor.downAt !== null || actor.behind || !units.has(target.unit.unitId) || (projectile.art && !flying)) {
        removeProjectile(unitId);
        continue;
      }
      sprite.visible = false;
      if (!flying) continue;
      const { weapon } = actor;
      const facing = actor.opponent ? -1 : 1;
      const release = weapon ? releaseMs(weapon.holdFrame, ACT_MS, weapon.frameMs) : releaseMs(actor.art?.actHold ?? 0, ACT_MS);
      const index = weapon ? heldFrame(simTime, act, weapon.holdFrame, weapon.swing.length, ACT_MS, weapon.frameMs) : null;
      const nock = index === null ? undefined : weapon?.nocks?.[index];
      const grip = index === null ? undefined : weapon?.grips[index];
      // Where it is let go from: the nock of the bow in hand, or the hand itself.
      const hand = { x: actor.x + facing * (HAND.x + (nock && grip ? nock.x - grip.x : 0)), y: actor.y + HAND.y + (nock && grip ? nock.y - grip.y + 0.5 : 0) };
      const progress = flightAt(simTime, act, release);
      let at: { x: number; y: number };
      if (progress !== null) at = flightPoint(hand, { x: target.x, y: target.y - flying.layout.height }, progress, flying.layout.arc);
      else if (simTime < act.from + release && nock) at = hand;
      else continue;
      const frame = progress === null ? 0 : Math.floor((simTime - act.from - release) / flying.layout.frameMs) % flying.frames.length;
      sprite.texture = must(flying.frames[frame], `frame ${frame} of the projectile`);
      sprite.scale.set(facing, 1);
      // On the string its tail is on the nock; in flight its middle is on the path.
      sprite.position.set(Math.round(at.x - (progress === null ? 0 : (facing * sprite.texture.width) / 2)), Math.round(at.y));
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

  const drawBar = (unitView: UnitView) => {
    const { unit } = unitView;
    const shown = unit.kind === 'resource' || unit.health <= 0 || unitView.behind ? '' : `${unit.health}/${unit.maxHealth}`;
    unitView.bar.position.set(Math.round(unitView.x) - 7, Math.round(unitView.y) + 2);
    unitView.bar.zIndex = unitView.y + 0.5;
    if (shown === unitView.barShown) return;
    unitView.barShown = shown;
    unitView.bar.clear();
    if (!shown) return;
    const share = unit.health / unit.maxHealth;
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
    // A fading down: the rows above the cut with their own alpha, the rest as drawn (rule 30).
    const source = texture.source;
    top.texture = new Texture({ source, frame: new Rectangle(0, 0, texture.width, cut) });
    top.pivot.set(texture.width / 2, frames.foot + 1);
    top.alpha = fade;
    top.visible = true;
    picture.texture = new Texture({ source, frame: new Rectangle(0, cut, texture.width, texture.height - cut) });
    picture.pivot.set(texture.width / 2, frames.foot + 1 - cut);
  };

  /** The weapon in hand at the act's frame, its grip on the hand, or none outside an act. */
  const drawWeapon = (unitView: UnitView, simTime: number) => {
    const { weapon, weaponSprite, act } = unitView;
    const index = weapon && act && unitView.downAt === null ? heldFrame(simTime, act, weapon.holdFrame, weapon.swing.length, ACT_MS, weapon.frameMs) : null;
    weaponSprite.visible = index !== null;
    if (index === null || !weapon) return;
    const grip = must(weapon.grips[index], `grip ${index} of the weapon`);
    weaponSprite.texture = must(weapon.swing[index], `frame ${index} of the weapon`);
    weaponSprite.position.set(HAND.x - grip.x, HAND.y - grip.y);
  };

  const draw = (unitView: UnitView, simTime: number, moving: boolean, rushing: boolean, mirrored: boolean) => {
    const art = unitView.art;
    drawWeapon(unitView, simTime);
    if (!art) return;
    if (unitView.downAt !== null) {
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
    const act = unitView.act;
    if (act) {
      const index = heldFrame(simTime, act, art.actHold, art.act.textures.length, ACT_MS);
      if (index !== null) {
        show(unitView, art.act, index, mirrored);
        return;
      }
      unitView.act = null;
      unitView.weaponSprite.visible = false;
    }
    if (unitView.hitAt !== null) {
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
    reset(field, sets, enter) {
      heroSets = sets;
      for (const effect of [...effects]) removeEffect(effect);
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
            unitView.hitAt = null;
          }
        }
      }
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
      for (const event of events) {
        if (event.kind === 'action-declared' && event.abilityId !== 'move-up') {
          const unitView = units.get(event.unitId);
          if (unitView) {
            unitView.act = { from: event.timestamp, resolve: event.resolveTimestamp };
            const set = ABILITY_EFFECTS[event.abilityId as AbilityId];
            const target = units.get(event.targetIds[0] ?? '');
            if (set && target && target !== unitView) addProjectile(set, unitView, target, unitView.act);
          }
        } else if (event.kind === 'action-resolved') {
          const set = ABILITY_EFFECTS[event.abilityId as AbilityId];
          const actor = units.get(event.unitId);
          removeProjectile(event.unitId);
          for (const effect of event.effects) {
            if (effect.kind === 'damage' || effect.kind === 'harvest') {
              const target = units.get(effect.targetId);
              if (target && effect.newHealth > 0) target.hitAt = target.clock;
            }
            // The effect lands on whoever the action reached: a guard that took a hit, not the ally it covered.
            if (set && effect.kind !== 'move') {
              const target = units.get(effect.targetId);
              if (target) addEffect(set, target, actor?.opponent ?? false);
            }
          }
        } else if (event.kind === 'unit-down') {
          const unitView = units.get(event.unitId);
          if (unitView) unitView.downAt = unitView.clock;
        }
      }
    },

    frame(ms, simTime, field) {
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
        // Once the adventure is over its clock stands still, so an act still showing would never finish.
        if (field.outcome !== null) unitView.act = null;
        const standing = unitView.downAt === null && unitView.unit.health > 0;
        if (unitView.behind) {
          unitView.x -= rolled;
          if (unitView.x < -view.stageX - 48) {
            removeUnit(unitView.unit.unitId);
            continue;
          }
          draw(unitView, simTime, false, false, unitView.opponent);
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
        draw(unitView, simTime, moving, rushing, mirrored);
        drawBar(unitView);
      }

      drawProjectiles(simTime);
      drawEffects();

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
