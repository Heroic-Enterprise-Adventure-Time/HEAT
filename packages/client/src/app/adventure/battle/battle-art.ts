import { Assets, Rectangle, Texture } from 'pixi.js';

import { loadSpriteSet, type SetPath } from '../../sprite-sheet';
import { fetchJson } from '../../static-json';
import { drawnFrame, effectLayout, type EffectLayout, EffectManifestSchema, type ProjectileLayout, projectileLayout, type Rect } from './action-sprites';

/**
 * A battle unit's pictures, from its sprite set's sheet (`sprite-sheet.ts`;
 * docs/process/assets.md, rules 11, 28 and 30): a hero or a monster by its
 * east-facing animations, drawn mirrored for the other side, and a prop such
 * as a tree by its standing picture, its hit and its down. Each animation
 * stands on the foot row of its first frame, so a figure keeps its ground
 * whatever the canvas. Beside them, an action's two sprites: a weapon's
 * swing and an ability's effect (rules 32 to 35).
 */

export interface Frames {
  readonly textures: readonly Texture[];
  /** The row of the first frame's lowest opaque pixel. */
  readonly foot: number;
}

export interface UnitArt {
  readonly stance: Frames;
  readonly walk: Frames;
  readonly act: Frames;
  /** The act's frame held until the action resolves (rule 11; the wolf's provenance). */
  readonly actHold: number;
  readonly hit: Frames;
  readonly down: Frames;
  /**
   * For a down marked `fadeAboveEnd`, the top row of its last frame's
   * picture: the rows above it fade evenly from the first frame to the last
   * (rule 30); null for any other.
   */
  readonly fadeAbove: number | null;
}

/** Where a unit's set is under `/art`: a hero's, a monster's or a prop's. */
export type UnitArtPath = SetPath<'figure' | 'prop'>;

const isProp = (path: UnitArtPath): path is SetPath<'prop'> => path.startsWith('props/');

async function figureArt(path: SetPath<'figure'>): Promise<UnitArt> {
  const sheet = await loadSpriteSet(path, 'figure');
  const east = (animation: 'stance' | 'walk' | 'act' | 'hit' | 'down'): Frames => ({ textures: sheet.clip(`${animation}-east`), foot: sheet.foot(`${animation}-east`) });
  return { stance: east('stance'), walk: east('walk'), act: east('act'), actHold: sheet.set.actHold, hit: east('hit'), down: east('down'), fadeAbove: null };
}

async function propArt(path: SetPath<'prop'>): Promise<UnitArt> {
  const sheet = await loadSpriteSet(path, 'prop');
  // A prop keeps the ground its standing picture has, through its hit and its down (rule 31).
  const foot = sheet.foot('standing');
  const still: Frames = { textures: sheet.clip('standing'), foot };
  return { stance: still, walk: still, act: still, actHold: 0, hit: { textures: sheet.clip('hit'), foot }, down: { textures: sheet.clip('down'), foot }, fadeAbove: sheet.set.fadeAbove };
}

/** A weapon's swing, drawn beside its wielder while it acts (rules 32 and 33). */
export interface WeaponArt {
  readonly swing: readonly Texture[];
  /** The swing's hold frame, as its provenance records it: the blow, or for a bow the string at rest after the release, which is when its arrow leaves. */
  readonly holdFrame: number;
  /** The frame the swing waits on until the action resolves, in step with the act's own: its hold frame, or for a bow its full draw (decision 0057). */
  readonly readyFrame: number;
  /** Each frame's grip, the pixel in the wielder's hand, from the provenance: PixelLab draws the swing turning about the canvas, not the hand. */
  readonly grips: readonly { readonly x: number; readonly y: number }[];
  /** How long each frame before the hold lasts, where the provenance says; a frame it does not name lasts as long as the act's. */
  readonly frameMs: readonly number[];
  /** A bow's nock on each frame, the middle of its string, where an arrow's tail sits while it is drawn; none for a weapon that shoots nothing. */
  readonly nocks: readonly { readonly x: number; readonly y: number }[] | null;
}

/** An ability's effect, cut from its game pack's sheet (rule 34), and its projectile where it has one (rule 35). */
export interface EffectArt {
  readonly layout: EffectLayout;
  readonly frames: readonly Texture[];
  readonly projectile: { readonly layout: ProjectileLayout; readonly frames: readonly Texture[] } | null;
}

/** A weapon's art: `<set>` under `/art/weapons`. */
export async function loadWeaponArt(set: string): Promise<WeaponArt> {
  const sheet = await loadSpriteSet(`weapons/${set}`, 'weapon');
  const { holdFrame, grips, frameMs, nocks } = sheet.set.swing;
  const pixels = (list: readonly (readonly [number, number])[]) => list.map(([x, y]) => ({ x, y }));
  const strung = nocks ? pixels(nocks) : null;
  const readyFrame = strung ? drawnFrame(pixels(grips), strung, holdFrame) : holdFrame;
  return { swing: sheet.clip('swing'), holdFrame, readyFrame, grips: pixels(grips), frameMs, nocks: strung };
}

/**
 * The effects cut so far, by set. An effect is its game pack's own sheet
 * and manifest, not a set the build packs, so its frames are cut here, once:
 * PixiJS keeps the sheet's picture by its address, and this keeps the
 * textures cut from it. A load that fails is dropped, so the next battle
 * tries again rather than failing until a reload.
 */
const effects = new Map<string, Promise<EffectArt>>();

/** An effect's art, loaded once: `<set>` under `/art/effects`. */
export function loadEffectArt(set: string): Promise<EffectArt> {
  const base = `/art/effects/${set}`;
  let art = effects.get(set);
  if (!art) {
    art = (async () => {
      const manifest = await fetchJson(`${base}/manifest.json`, EffectManifestSchema);
      const cut = async (clip: { readonly sheet: string; readonly frames: readonly Rect[] }) => {
        const sheet = await Assets.load<Texture>(`${base}/${clip.sheet}`);
        return clip.frames.map((r) => new Texture({ source: sheet.source, frame: new Rectangle(r.x, r.y, r.width, r.height) }));
      };
      const layout = effectLayout(manifest);
      const flying = projectileLayout(manifest);
      return { layout, frames: await cut(layout), projectile: flying && { layout: flying, frames: await cut(flying) } };
    })();
    effects.set(set, art);
    art.catch(() => { effects.delete(set); });
  }
  return art;
}

/** A set's art: `heroes/<set>`, `monsters/<set>` or `props/<set>` under `/art`. */
export function loadUnitArt(path: UnitArtPath): Promise<UnitArt> {
  return isProp(path) ? propArt(path) : figureArt(path);
}
