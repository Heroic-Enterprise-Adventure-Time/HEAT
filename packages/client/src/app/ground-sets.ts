/**
 * What the art build and the scenes agree on about the ground (decision
 * 0027; typescript.md, rule 23): the ground sets the page draws, by their
 * directory under `art/ground/`, and the files it asks each for. The build
 * (`packages/client/scripts/copy-art.mjs`) refuses a set here that it did not
 * copy whole, so a name added here with no art fails the build, not a scene.
 *
 * Each set says the colour its canvas shows until its tiles are laid: the
 * meadow's is the green both scenes have always been made with, which
 * `scripts/icon-set.mjs` reads from here to judge a drop's icon against, and
 * the crag's is its rock's, so a scene does not flash another place's colour
 * while its art loads.
 *
 * Node runs this file as it is for the build, with its types stripped, so it
 * holds only what stripping leaves working, as `sprite-sets.ts` does.
 */
export const GROUNDS = {
  'meadow-01': { backdrop: '#4f7f2a' },
  'crag-01': { backdrop: '#645b59' },
} as const;
export type GroundSet = keyof typeof GROUNDS;

/** The files the page asks a ground set for: PixelLab's metadata and its sheet (assets.md, rule 14). */
export const GROUND_FILES = ['tileset.json', 'tileset.png'] as const;
export type GroundFile = (typeof GROUND_FILES)[number];
