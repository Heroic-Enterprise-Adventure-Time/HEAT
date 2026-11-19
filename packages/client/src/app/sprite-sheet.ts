import { Assets, Spritesheet, type Texture } from 'pixi.js';
import * as z from 'zod/mini';

import { must } from '@heat/engine';

import { checkJson } from './static-json';

/**
 * A sprite set as the scenes load it (decision 0028, Issue-205): one sheet
 * the build packed from the set's frames, `sheet.png`, and its atlas,
 * `sheet.json`, which PixiJS reads into the set's textures and animations.
 * Beside the atlas the build writes what a scene reads about the set, under
 * `set`: the row each clip stands on and how the set plays
 * (`packages/client/scripts/pack-art.mjs`). Imported only by the scenes, so
 * it loads with PixiJS.
 */

const Pixel = z.tuple([z.number(), z.number()]);
/** The row each clip stands on, by the clip's name: the lowest opaque row of its first frame. */
const Feet = z.record(z.string(), z.number());

/** A hero's or a monster's set: its act's frame held until the action resolves (assets.md, rules 11 and 28). */
export const FigureSetSchema = z.object({ kind: z.literal('figure'), feet: Feet, actHold: z.number() });
/** A prop's set: for a down that fades, the top row of its last frame's picture, above which it fades (rule 30). */
export const PropSetSchema = z.object({ kind: z.literal('prop'), feet: Feet, fadeAbove: z.nullable(z.number()) });
/** A weapon's set: its swing's hold frame, each frame's grip, and for a bow its frames' lengths and nocks (rule 33). */
export const WeaponSetSchema = z.object({
  kind: z.literal('weapon'),
  feet: Feet,
  swing: z.object({ holdFrame: z.number(), grips: z.array(Pixel), frameMs: z.array(z.number()), nocks: z.nullable(z.array(Pixel)) }),
});

export interface SpriteSet<Set> {
  /** The textures of a clip in order, by its name: `walk-east`, or `standing` for a clip of one frame. */
  readonly clip: (name: string) => readonly Texture[];
  /** The row the clip stands on. */
  readonly foot: (name: string) => number;
  readonly set: Set;
}

/**
 * The set at `path`, `heroes/<set>` or `weapons/<set>` under `/art`, loaded
 * through PixiJS's `Assets`, which keeps it by its address: every later
 * call answers the same sheet, and a load that failed is tried again by the
 * next. What the build wrote under `set` is checked against `schema` here,
 * where it is read (angular.md, rule 4).
 */
export async function loadSpriteSet<Schema extends z.ZodMiniType>(path: string, schema: Schema): Promise<SpriteSet<z.output<Schema>>> {
  const url = `/art/${path}/sheet.json`;
  // Every set names its frames alike, `walk-east-0`, so each is kept under its own set's path.
  const sheet: unknown = await Assets.load({ src: url, data: { cachePrefix: `${path}/` } });
  if (!(sheet instanceof Spritesheet)) throw new Error(`${url} is not a sprite sheet`);
  // PixiJS keeps the file as it read it, the build's own key beside the atlas's.
  const data: unknown = sheet.data;
  const written: unknown = typeof data === 'object' && data !== null && 'set' in data ? data.set : undefined;
  const set = checkJson(url, written, schema);
  const { feet } = checkJson(url, written, z.object({ feet: Feet }));
  return {
    clip: (name) => must(sheet.animations[name], `the clip ${name} of ${path}`),
    foot: (name) => must(feet[name], `the foot row of ${name} of ${path}`),
    set,
  };
}
