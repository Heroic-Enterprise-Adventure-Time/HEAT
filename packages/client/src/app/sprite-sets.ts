/**
 * What the art build and the scenes agree on about a sprite set (decision
 * 0028, Issue-205; typescript.md, rule 23): the kinds of set, where each is
 * under `art/`, and the clips a scene asks a set of each kind for by name.
 * The build (`packages/client/scripts/pack-art.mjs`) refuses a set without
 * one of them, and a scene can ask a sheet for no other
 * (`sprite-sheet.ts`), so a clip added here is checked on both sides.
 *
 * Node runs this file as it is for the build, with its types stripped, so it
 * holds only what stripping leaves working: no enum, no namespace, no
 * import that is not a type's.
 */

/** The clips of a set of each kind: a clip of several frames is `<clip>-0` on, and one of a single frame is its name alone. */
export const SET_CLIPS = {
  /** A hero or a monster: the camp's stills and walks, and the battle's clips, which face east. */
  figure: ['still-south', 'still-east', 'still-north', 'still-west', 'walk-south', 'walk-east', 'walk-north', 'stance-east', 'act-east', 'hit-east', 'down-east'],
  prop: ['standing', 'hit', 'down'],
  weapon: ['swing'],
  /**
   * A font: the glyphs a scene draws as sprites, each a clip of one frame
   * named for its character, which the build cuts from the font's atlas
   * (assets.md, rule 37). The battle's amounts need the digits and no more.
   */
  font: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
} as const;

export type SetKind = keyof typeof SET_CLIPS;
/** A clip a scene may ask a set of this kind for. */
export type SetClip<Kind extends SetKind> = (typeof SET_CLIPS)[Kind][number];

/**
 * A hero's portrait, which the hero tile shows (decision 0061, Issue-385):
 * the build cuts a square of `side` art pixels from the top of the set's
 * `clip`, its head and shoulders facing the player, centred on the columns
 * those rows fill, and publishes it under `/art/portraits`. The page draws
 * it at `scale`, from `--portrait`, which the build writes from these two
 * into generated/frames.css.
 */
export const PORTRAIT = { clip: 'still-south', side: 24, scale: 2 } as const satisfies { clip: SetClip<'figure'>; side: number; scale: number };

/**
 * The page's frames (decision 0062): the build refuses an
 * art/frames/provenance.json that names other frames, and src/primitives.css
 * reads each as `--frame-<name>-image`, `-slice` and `-width`.
 */
export const FRAMES = ['panel', 'primary', 'secondary'] as const;

/** The areas under `art/` whose sets are packed, each served under `/art/<area>/<set>`, and the kind of set it holds. */
export const PACKED_AREAS = { heroes: 'figure', monsters: 'figure', props: 'prop', weapons: 'weapon', fonts: 'font' } as const satisfies Record<string, SetKind>;
export type PackedArea = keyof typeof PACKED_AREAS;
