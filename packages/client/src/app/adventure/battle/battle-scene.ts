import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture, TextureStyle } from 'pixi.js';
import { MONSTER_SPRITE_SETS, PROP_SPRITE_SETS, UNIT_PROFILES, type AdventureEvent, type Line, type MonsterType, type ResourceType, type UnitType } from '@heat/engine';
import { layGround, type Terrain, type TilesetJson } from '../../camp/scene/ground';
import type { Field, FieldUnit } from '../field';
import { battleView, entryOffset, spots, type BattleView } from './battle-layout';
import { loadUnitArt, type Frames, type UnitArt } from './battle-art';

/**
 * The battle scene, drawn with PixiJS like the camp (decision 0028): the
 * camp's sprites side-on on a meadow road, at the largest whole scale of
 * device pixels that fits, the ground running on to fill the box.
 *
 * It draws from the field, where everyone stands and how they are, and
 * animates from the events: an action's act, held on its hold frame until
 * it resolves; a hit; a fall, held; a step up a line or a collapse as a walk.
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

/** Art pixels a second: the road on a travel, a rush on, and a step up a line. */
const TRAVEL_SPEED = 40;
const RUSH_SPEED = 320;
const STEP_SPEED = 90;
/** Milliseconds a frame: on the clock for an act, a hit and a fall; on the presentation clock for a walk and the stance. */
const ACT_MS = 90;
const HIT_MS = 70;
const DOWN_MS = 100;
const WALK_MS = 100;
const RUSH_WALK_MS = 50;
const STANCE_MS = 150;

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
  readonly bar: Graphics;
  barShown: string;
  x: number;
  y: number;
  act: { readonly from: number; readonly resolve: number } | null;
  hitAt: number | null;
  downAt: number | null;
  /** On the presentation clock, for the walk and the stance. */
  clock: number;
  /** No longer in the field: what is left of a stage, scrolled away with the road. */
  behind: boolean;
}

function artPath(unit: FieldUnit, heroSets: ReadonlyMap<string, string>): string | null {
  if (unit.kind === 'hero') {
    const set = heroSets.get(unit.unitId);
    return set ? `heroes/${set}` : null;
  }
  if (unit.kind === 'monster') {
    const set = MONSTER_SPRITE_SETS[unit.type as MonsterType]?.[0];
    return set ? `monsters/${set}` : null;
  }
  const set = PROP_SPRITE_SETS[unit.type as ResourceType]?.[0];
  return set ? `props/${set}` : null;
}

/** A hero with no line yet, before its first fight, stands on its unit type's home line. */
function lineOf(unit: FieldUnit): Line {
  return unit.line ?? UNIT_PROFILES[unit.type as UnitType]?.homeLine ?? 'near';
}

const frameOf = (frames: Frames, index: number) => frames.textures[Math.max(0, Math.min(frames.textures.length - 1, index))]!;

export async function createBattleScene(host: HTMLElement, callbacks: BattleSceneCallbacks): Promise<BattleSceneHandle> {
  TextureStyle.defaultOptions.scaleMode = 'nearest';
  const app = new Application();
  await app.init({ width: 320, height: 180, background: '#4f7f2a', antialias: false, resolution: 1, roundPixels: true });
  app.canvas.style.imageRendering = 'pixelated';
  app.canvas.style.display = 'block';
  host.appendChild(app.canvas);

  const tileset = (await (await fetch('/art/ground/meadow-01/tileset.json')).json()) as TilesetJson;
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
    const corners = Array.from({ length: rows + 1 }, (_, r): Terrain[] => {
      const row = row0 + r;
      const terrain: Terrain = row >= ROAD_ROWS.from && row <= ROAD_ROWS.to ? 'lower' : 'upper';
      return Array.from({ length: cols + 1 }, () => terrain);
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
    const device = entry.devicePixelContentBoxSize?.[0];
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
    const bar = new Graphics();
    body.addChild(picture, top);
    things.addChild(body, bar);
    const unitView: UnitView = {
      unit,
      opponent: unit.side === 'opponents',
      art: null,
      body,
      picture,
      top,
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
    units.set(unit.unitId, unitView);
    return unitView;
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

  const draw = (unitView: UnitView, simTime: number, moving: boolean, rushing: boolean, mirrored: boolean) => {
    const art = unitView.art;
    if (!art) return;
    if (unitView.downAt !== null) {
      const last = art.down.textures.length - 1;
      const index = Math.min(last, Math.floor((simTime - unitView.downAt) / DOWN_MS));
      show(unitView, art.down, index, mirrored, last > 0 ? 1 - index / last : null);
      return;
    }
    const act = unitView.act;
    if (act) {
      const hold = art.actHold;
      const index = simTime < act.resolve ? Math.min(hold, Math.floor((simTime - act.from) / ACT_MS)) : hold + 1 + Math.floor((simTime - act.resolve) / ACT_MS);
      if (index < art.act.textures.length) {
        show(unitView, art.act, index, mirrored);
        return;
      }
      unitView.act = null;
    }
    if (unitView.hitAt !== null) {
      const index = Math.floor((simTime - unitView.hitAt) / HIT_MS);
      if (index < art.hit.textures.length) {
        show(unitView, art.hit, index, mirrored);
        return;
      }
      unitView.hitAt = null;
    }
    if (moving) show(unitView, art.walk, Math.floor(unitView.clock / (rushing ? RUSH_WALK_MS : WALK_MS)), mirrored);
    else show(unitView, art.stance, Math.floor(unitView.clock / STANCE_MS), mirrored);
  };

  return {
    reset(field, sets, enter) {
      heroSets = sets;
      for (const id of [...units.keys()]) removeUnit(id);
      scroll = 0;
      offset = 0;
      sync(field);
      const at = targets(field);
      for (const unitView of units.values()) {
        const spot = at.get(unitView.unit.unitId)!;
        unitView.y = spot.y;
        // Running on, each hero starts beyond the left edge, as far behind its spot as the front of the party is from the edge.
        unitView.x = enter && !unitView.opponent ? spot.x - (view.stageX + 180) : spot.x;
        if (unitView.unit.health <= 0) unitView.downAt = -Infinity;
      }
      entering = enter ? 'party' : null;
      if (!enter) placeRoad();
    },

    feed(events, field) {
      const beginning = events.find((e) => e.kind === 'stage-start' && (e.stageKind === 'fight' || e.stageKind === 'gather'));
      if (beginning) {
        // What is left of the last stage scrolls away as the new one comes on.
        for (const unitView of units.values()) if (unitView.opponent) unitView.behind = true;
      }
      sync(field);
      if (beginning) {
        const at = targets(field);
        const fresh = field.opponents.map((u) => units.get(u.unitId)!).filter((v) => !v.behind);
        offset = entryOffset(fresh.map((v) => at.get(v.unit.unitId)!.x));
        for (const unitView of fresh) {
          const spot = at.get(unitView.unit.unitId)!;
          unitView.x = spot.x + offset;
          unitView.y = spot.y;
        }
        entering = 'opponents';
      }
      for (const event of events) {
        if (event.kind === 'action-declared' && event.abilityId !== 'move-up') {
          const unitView = units.get(event.unitId);
          if (unitView) unitView.act = { from: event.timestamp, resolve: event.resolveTimestamp };
        } else if (event.kind === 'action-resolved') {
          for (const effect of event.effects) {
            if (effect.kind === 'damage' || effect.kind === 'harvest') {
              const target = units.get(effect.targetId);
              if (target && effect.newHealth > 0) target.hitAt = event.timestamp;
            }
          }
        } else if (event.kind === 'unit-down') {
          const unitView = units.get(event.unitId);
          if (unitView) unitView.downAt = event.timestamp;
        }
      }
    },

    frame(ms, simTime, field) {
      const at = targets(field);
      const travelling = entering === null && field.outcome === null && field.stageKind === 'travel';
      const retreating = field.outcome === 'retreat';
      let rolled = 0;
      if (entering === 'opponents') {
        const step = Math.min(offset, (RUSH_SPEED * ms) / 1000);
        offset -= step;
        rolled = step;
      } else if (travelling) {
        rolled = (TRAVEL_SPEED * ms) / 1000;
      }
      scroll += rolled;
      placeRoad();

      let partyOn = true;
      for (const unitView of [...units.values()]) {
        unitView.clock += ms;
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
        const spot = at.get(unitView.unit.unitId)!;
        let moving = false;
        let rushing = false;
        let mirrored = unitView.opponent;
        if (unitView.opponent && entering === 'opponents') {
          unitView.x = spot.x + offset;
          unitView.y = spot.y;
          moving = offset > 0;
          rushing = true;
        } else if (!unitView.opponent && retreating && standing) {
          // A retreat: the party turns and runs off to the left.
          unitView.x -= (RUSH_SPEED / 2) * (ms / 1000);
          moving = true;
          rushing = true;
          mirrored = true;
        } else {
          const speed = entering === 'party' ? RUSH_SPEED : STEP_SPEED;
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
            rushing = entering === 'opponents';
          }
        }
        draw(unitView, simTime, moving, rushing, mirrored);
        drawBar(unitView);
      }

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
