import { Assets, type Texture } from 'pixi.js';
import { highestOpaqueRow, lowestOpaqueRow } from '../../pixel-art';

/**
 * A battle unit's pictures, read from its sprite set's files and its
 * provenance (docs/process/assets.md, rules 11, 28 and 30): a hero or a
 * monster by its east-facing animations, drawn mirrored for the other side,
 * and a prop such as a tree by its standing picture, its hit and its down.
 * Each animation stands on the foot row of its first frame, so a figure
 * keeps its ground whatever the canvas.
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
  return { textures, foot: lowestOpaqueRow(footOf ?? textures[0]!) };
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

async function figureArt(base: string): Promise<UnitArt> {
  const provenance = (await (await fetch(`${base}/provenance.json`)).json()) as Provenance;
  const count = (anim: string) => provenance.animations?.[anim]?.framesPerDirection ?? 1;
  const east = (anim: string) => range(count(anim)).map((i) => `${base}/${anim}-east-${i}.png`);
  const [stance, walk, act, hit, down] = await Promise.all(['stance', 'walk', 'act', 'hit', 'down'].map((a) => frames(east(a))));
  return { stance: stance!, walk: walk!, act: act!, actHold: provenance.animations?.['act']?.holdFrame ?? 0, hit: hit!, down: down!, fadeAbove: null };
}

async function propArt(base: string): Promise<UnitArt> {
  const provenance = (await (await fetch(`${base}/provenance.json`)).json()) as Provenance;
  const standing = await Assets.load<Texture>(`${base}/standing.png`);
  const still = { textures: [standing], foot: lowestOpaqueRow(standing) };
  const count = (anim: string) => provenance.animations?.[anim]?.frames ?? 1;
  const [hit, down] = await Promise.all(['hit', 'down'].map((a) => frames(range(count(a)).map((i) => `${base}/${a}-${i}.png`), standing)));
  const fades = provenance.animations?.['down']?.fadeAboveEnd === true;
  return { stance: still, walk: still, act: still, actHold: 0, hit: hit!, down: down!, fadeAbove: fades ? highestOpaqueRow(down!.textures.at(-1)!) : null };
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
