import { range } from 'es-toolkit';
import { Assets, Rectangle, Texture } from 'pixi.js';
import * as z from 'zod/mini';

import { must } from '@heat/engine';

import { highestOpaqueRow, lowestOpaqueRow } from '../../pixel-art';
import { fetchJson } from '../../static-json';
import { effectLayout, type EffectLayout, EffectManifestSchema, type ProjectileLayout, projectileLayout, type Rect } from './action-sprites';

/**
 * A battle unit's pictures, read from its sprite set's files and its
 * provenance (docs/process/assets.md, rules 11, 28 and 30): a hero or a
 * monster by its east-facing animations, drawn mirrored for the other side,
 * and a prop such as a tree by its standing picture, its hit and its down.
 * Each animation stands on the foot row of its first frame, so a figure
 * keeps its ground whatever the canvas. Beside them, an action's two sprites:
 * a weapon's swing and an ability's effect (rules 32 to 35).
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

/** A sprite set's provenance, as much of it as the battle reads: how many frames each animation has, and how it plays; checked where it is fetched (angular.md, rule 4). */
const ProvenanceSchema = z.object({
  animations: z.optional(
    z.record(
      z.string(),
      z.object({ framesPerDirection: z.optional(z.number()), frames: z.optional(z.number()), holdFrame: z.optional(z.number()), fadeAboveEnd: z.optional(z.boolean()) }),
    ),
  ),
});

async function frames(paths: readonly string[], footOf?: Texture): Promise<Frames> {
  const textures = await Promise.all(paths.map((p) => Assets.load<Texture>(p)));
  return { textures, foot: lowestOpaqueRow(footOf ?? must(textures[0], 'the first frame')) };
}

async function figureArt(base: string): Promise<UnitArt> {
  const provenance = await fetchJson(`${base}/provenance.json`, ProvenanceSchema);
  const count = (anim: string) => provenance.animations?.[anim]?.framesPerDirection ?? 1;
  const east = (anim: string) => range(count(anim)).map((i) => `${base}/${anim}-east-${i}.png`);
  const [stance, walk, act, hit, down] = await Promise.all([frames(east('stance')), frames(east('walk')), frames(east('act')), frames(east('hit')), frames(east('down'))]);
  return { stance, walk, act, actHold: provenance.animations?.['act']?.holdFrame ?? 0, hit, down, fadeAbove: null };
}

async function propArt(base: string): Promise<UnitArt> {
  const provenance = await fetchJson(`${base}/provenance.json`, ProvenanceSchema);
  const standing = await Assets.load<Texture>(`${base}/standing.png`);
  const still = { textures: [standing], foot: lowestOpaqueRow(standing) };
  const count = (anim: string) => provenance.animations?.[anim]?.frames ?? 1;
  const animation = (a: string) => frames(range(count(a)).map((i) => `${base}/${a}-${i}.png`), standing);
  const [hit, down] = await Promise.all([animation('hit'), animation('down')]);
  const fades = provenance.animations?.['down']?.fadeAboveEnd === true;
  return { stance: still, walk: still, act: still, actHold: 0, hit, down, fadeAbove: fades ? highestOpaqueRow(must(down.textures.at(-1), 'the last down frame')) : null };
}

/** A weapon's swing, drawn beside its wielder while it acts (rules 32 and 33). */
export interface WeaponArt {
  readonly swing: readonly Texture[];
  /** The swing's frame held until the action resolves, in step with the act's own. */
  readonly holdFrame: number;
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

const Pixel = z.tuple([z.number(), z.number()]);

/** A weapon's provenance, as much of it as the battle reads: the swing's frames, the one held, each frame's grip, and for a bow its frames' lengths and nocks. */
const WeaponProvenanceSchema = z.object({
  animations: z.object({
    swing: z.object({
      frames: z.number(),
      holdFrame: z.number(),
      grips: z.array(Pixel),
      frameMs: z.optional(z.array(z.number())),
      nocks: z.optional(z.array(Pixel)),
    }),
  }),
});

/**
 * The art under `key`, loaded once and shared by every battle after. A load
 * that fails, a fetch or a file its schema refuses, is dropped from the
 * cache, so the next battle tries again rather than failing until a reload.
 */
function loadOnce<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  let art = cache.get(key);
  if (!art) {
    art = load();
    cache.set(key, art);
    art.catch(() => { cache.delete(key); });
  }
  return art;
}

const weapons = new Map<string, Promise<WeaponArt>>();
const effects = new Map<string, Promise<EffectArt>>();

/** A weapon's art, loaded once: `<set>` under `/art/weapons`. */
export function loadWeaponArt(set: string): Promise<WeaponArt> {
  const base = `/art/weapons/${set}`;
  return loadOnce(weapons, set, async () => {
    const provenance = await fetchJson(`${base}/provenance.json`, WeaponProvenanceSchema);
    const { frames, holdFrame, grips, frameMs, nocks } = provenance.animations.swing;
    const swing = await Promise.all(range(frames).map((i) => Assets.load<Texture>(`${base}/swing-${i}.png`)));
    const pixels = (list: readonly (readonly [number, number])[]) => list.map(([x, y]) => ({ x, y }));
    return { swing, holdFrame, grips: pixels(grips), frameMs: frameMs ?? [], nocks: nocks ? pixels(nocks) : null };
  });
}

/** An effect's art, loaded once: `<set>` under `/art/effects`. */
export function loadEffectArt(set: string): Promise<EffectArt> {
  const base = `/art/effects/${set}`;
  return loadOnce(effects, set, async () => {
    const manifest = await fetchJson(`${base}/manifest.json`, EffectManifestSchema);
    const cut = async (clip: { readonly sheet: string; readonly frames: readonly Rect[] }) => {
      const sheet = await Assets.load<Texture>(`${base}/${clip.sheet}`);
      return clip.frames.map((r) => new Texture({ source: sheet.source, frame: new Rectangle(r.x, r.y, r.width, r.height) }));
    };
    const layout = effectLayout(manifest);
    const flying = projectileLayout(manifest);
    return { layout, frames: await cut(layout), projectile: flying && { layout: flying, frames: await cut(flying) } };
  });
}

const loaded = new Map<string, Promise<UnitArt>>();

/** A set's art, loaded once: `heroes/<set>`, `monsters/<set>` or `props/<set>` under `/art`. */
export function loadUnitArt(path: string): Promise<UnitArt> {
  return loadOnce(loaded, path, () => (path.startsWith('props/') ? propArt(`/art/${path}`) : figureArt(`/art/${path}`)));
}
