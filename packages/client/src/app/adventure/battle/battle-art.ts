import { range } from 'es-toolkit';
import { Assets, Rectangle, Texture } from 'pixi.js';
import { highestOpaqueRow, lowestOpaqueRow } from '../../pixel-art';
import { effectLayout, type EffectLayout, type EffectManifest } from './action-sprites';
import { must } from '@heat/engine';

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

interface Provenance {
  animations?: Record<string, { framesPerDirection?: number; frames?: number; holdFrame?: number; fadeAboveEnd?: boolean }>;
}

async function frames(paths: readonly string[], footOf?: Texture): Promise<Frames> {
  const textures = await Promise.all(paths.map((p) => Assets.load<Texture>(p)));
  return { textures, foot: lowestOpaqueRow(footOf ?? must(textures[0], 'the first frame')) };
}

async function figureArt(base: string): Promise<UnitArt> {
  const provenance = (await (await fetch(`${base}/provenance.json`)).json()) as Provenance;
  const count = (anim: string) => provenance.animations?.[anim]?.framesPerDirection ?? 1;
  const east = (anim: string) => range(count(anim)).map((i) => `${base}/${anim}-east-${i}.png`);
  const [stance, walk, act, hit, down] = await Promise.all([frames(east('stance')), frames(east('walk')), frames(east('act')), frames(east('hit')), frames(east('down'))]);
  return { stance, walk, act, actHold: provenance.animations?.['act']?.holdFrame ?? 0, hit, down, fadeAbove: null };
}

async function propArt(base: string): Promise<UnitArt> {
  const provenance = (await (await fetch(`${base}/provenance.json`)).json()) as Provenance;
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
}

/** An ability's effect, cut from its game pack's sheet (rule 34). */
export interface EffectArt {
  readonly layout: EffectLayout;
  readonly frames: readonly Texture[];
}

interface WeaponProvenance {
  animations: { swing: { frames: number; holdFrame: number; grips: [number, number][] } };
}

const weapons = new Map<string, Promise<WeaponArt>>();
const effects = new Map<string, Promise<EffectArt>>();

/** A weapon's art, loaded once: `<set>` under `/art/weapons`. */
export function loadWeaponArt(set: string): Promise<WeaponArt> {
  let art = weapons.get(set);
  if (!art) {
    const base = `/art/weapons/${set}`;
    art = (async () => {
      const provenance = (await (await fetch(`${base}/provenance.json`)).json()) as WeaponProvenance;
      const { frames, holdFrame, grips } = provenance.animations.swing;
      const swing = await Promise.all(range(frames).map((i) => Assets.load<Texture>(`${base}/swing-${i}.png`)));
      return { swing, holdFrame, grips: grips.map(([x, y]) => ({ x, y })) };
    })();
    weapons.set(set, art);
  }
  return art;
}

/** An effect's art, loaded once: `<set>` under `/art/effects`. */
export function loadEffectArt(set: string): Promise<EffectArt> {
  let art = effects.get(set);
  if (!art) {
    const base = `/art/effects/${set}`;
    art = (async () => {
      const layout = effectLayout((await (await fetch(`${base}/manifest.json`)).json()) as EffectManifest);
      const sheet = await Assets.load<Texture>(`${base}/${layout.sheet}`);
      const frames = layout.frames.map((r) => new Texture({ source: sheet.source, frame: new Rectangle(r.x, r.y, r.width, r.height) }));
      return { layout, frames };
    })();
    effects.set(set, art);
  }
  return art;
}

const loaded = new Map<string, Promise<UnitArt>>();

/** A set's art, loaded once: `heroes/<set>`, `monsters/<set>` or `props/<set>` under `/art`. */
export function loadUnitArt(path: string): Promise<UnitArt> {
  let art = loaded.get(path);
  if (!art) {
    art = path.startsWith('props/') ? propArt(`/art/${path}`) : figureArt(`/art/${path}`);
    loaded.set(path, art);
  }
  return art;
}
