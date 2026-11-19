import { Assets, Spritesheet, type Texture } from 'pixi.js';
import * as z from 'zod/mini';

import { must } from '@heat/engine';

import type { PACKED_AREAS, PackedArea, SetClip, SetKind } from './sprite-sets';
import { checkJson } from './static-json';

/**
 * A sprite set as the scenes load it (decision 0028, Issue-205): one sheet
 * the build packed from the set's frames, `sheet.<hash>.png`, named for its
 * pixels, and its atlas, `sheet.json`, which names that image and which
 * PixiJS reads into the set's textures and animations. Beside the atlas the
 * build writes what a scene reads about the set, under `set`: the row each
 * clip stands on and how the set plays
 * (`packages/client/scripts/pack-art.mjs`). The kinds of set and the clips a
 * scene may ask one for are `sprite-sets.ts`'s, which the build checks every
 * set against. Imported only by the scenes, so it loads with PixiJS.
 */

const Pixel = z.tuple([z.number(), z.number()]);
/** The row each clip stands on, by the clip's name: the lowest opaque row of its first frame. */
const Feet = z.record(z.string(), z.number());

/** What the build writes about a set of each kind, checked where it is read (angular.md, rule 4). */
const SET_SCHEMAS = {
  /** A hero's or a monster's set: its act's frame held until the action resolves (assets.md, rules 11 and 28). */
  figure: z.object({ kind: z.literal('figure'), feet: Feet, actHold: z.number() }),
  /** A prop's set: for a down that fades, the top row of its last frame's picture, above which it fades (rule 30). */
  prop: z.object({ kind: z.literal('prop'), feet: Feet, fadeAbove: z.nullable(z.number()) }),
  /** A weapon's set: its swing's hold frame, each frame's grip, and for a bow its frames' lengths and nocks (rule 33). */
  weapon: z.object({
    kind: z.literal('weapon'),
    feet: Feet,
    swing: z.object({ holdFrame: z.number(), grips: z.array(Pixel), frameMs: z.array(z.number()), nocks: z.nullable(z.array(Pixel)) }),
  }),
} satisfies { readonly [Kind in SetKind]: z.ZodMiniType<{ kind: Kind; feet: Record<string, number> }> };

/** What a scene reads about a set of each kind: its schema's type. */
type SetFacts = { readonly [Kind in SetKind]: z.output<(typeof SET_SCHEMAS)[Kind]> };
/** The same schemas, each as the schema of its kind's facts, which is how a kind not yet known is looked up. */
const SCHEMA_OF: { readonly [Kind in SetKind]: z.ZodMiniType<SetFacts[Kind]> } = SET_SCHEMAS;

/** Where a set of this kind is under `/art`: `heroes/<set>` or `monsters/<set>` for a figure. */
export type SetPath<Kind extends SetKind> = `${{ [Area in PackedArea]: (typeof PACKED_AREAS)[Area] extends Kind ? Area : never }[PackedArea]}/${string}`;

export interface SpriteSet<Kind extends SetKind> {
  /** The textures of a clip in order, by its name: `walk-east`, or `standing` for a clip of one frame. */
  readonly clip: (name: SetClip<Kind>) => readonly Texture[];
  /** The row the clip stands on. */
  readonly foot: (name: SetClip<Kind>) => number;
  readonly set: SetFacts[Kind];
}

/**
 * The set at `path` under `/art`, of the kind its area holds, loaded
 * through PixiJS's `Assets`, which keeps it by its address: every later
 * call answers the same sheet, and a load that failed is tried again by the
 * next. What the build wrote under `set` is checked against the kind's
 * schema here, where it is read.
 */
export async function loadSpriteSet<Kind extends SetKind>(path: SetPath<Kind>, kind: Kind): Promise<SpriteSet<Kind>> {
  const url = `/art/${path}/sheet.json`;
  // Every set names its frames alike, `walk-east-0`, so each is kept under its own set's path.
  const sheet: unknown = await Assets.load({ src: url, data: { cachePrefix: `${path}/` } });
  if (!(sheet instanceof Spritesheet)) throw new Error(`${url} is not a sprite sheet`);
  // PixiJS keeps the file as it read it, the build's own key beside the atlas's.
  const data: unknown = sheet.data;
  const written: unknown = typeof data === 'object' && data !== null && 'set' in data ? data.set : undefined;
  const set: SetFacts[Kind] = checkJson(url, written, SCHEMA_OF[kind]);
  return {
    clip: (name) => must(sheet.animations[name], `the clip ${name} of ${path}`),
    foot: (name) => must(set.feet[name], `the foot row of ${name} of ${path}`),
    set,
  };
}
