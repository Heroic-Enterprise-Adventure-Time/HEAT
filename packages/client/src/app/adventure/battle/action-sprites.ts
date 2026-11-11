/**
 * The arithmetic of an action's two sprites (game.md, "How the game looks";
 * docs/process/assets.md, rules 32 to 35), apart from the renderer so that
 * it is tested without one: which frame of an act, or of the weapon swung
 * with it, shows at a time on the adventure's clock, which frame of an
 * effect shows a while after it began, and where, and where a projectile is
 * between the hand that let it go and whatever it lands on.
 */
import { range, sum } from 'es-toolkit';
import * as z from 'zod/mini';

/** PixelLab's game pack manifest, as much of it as the battle reads: the whole effect, without the sprite, or its projectile and its impact where a clip has a role; checked where it is fetched (angular.md, rule 4). */
export const EffectManifestSchema = z.object({
  frame_ms: z.number(),
  clips: z.array(
    z.object({
      name: z.string(),
      role: z.optional(z.string()),
      start_frame: z.number(),
      frames: z.number(),
      frame: z.object({ w: z.number(), h: z.number() }),
      sheets: z.array(z.object({ file: z.string(), first_frame: z.number(), frames: z.number(), columns: z.number() })),
      offset: z.object({ x: z.number(), y: z.number() }),
      moves: z.optional(z.array(z.object({ x: z.number(), y: z.number() }))),
    }),
  ),
});

export type EffectManifest = z.output<typeof EffectManifestSchema>;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** An effect cut from its sheet: each frame's place on it, and where a frame stands from the target's feet. */
export interface EffectLayout {
  readonly sheet: string;
  readonly frames: readonly Rect[];
  /** The top left of a frame from the target's feet, for an actor on the left; mirrored, it is drawn from the right. */
  readonly offset: { readonly x: number; readonly y: number };
  /** The effect's own frames before its first drawn one: it begins that much after the action resolves. */
  readonly delayFrames: number;
  readonly frameMs: number;
}

type Clip = EffectManifest['clips'][number];

function cut(clip: Clip): { sheet: string; frames: Rect[] } {
  const sheet = clip.sheets[0];
  if (!sheet) throw new Error(`the clip ${clip.name} has no sheet`);
  const { w, h } = clip.frame;
  const frames = range(clip.frames).map((i) => ({
    x: (i % sheet.columns) * w,
    y: Math.floor(i / sheet.columns) * h,
    width: w,
    height: h,
  }));
  return { sheet: sheet.file, frames };
}

/**
 * What plays on the target when the action resolves: the impact clip of an
 * effect that has a projectile, from the moment it lands, and otherwise the
 * whole effect, after the frames it leaves empty (rule 35).
 */
export function effectLayout(manifest: EffectManifest): EffectLayout {
  const impact = manifest.clips.find((c) => c.role === 'impact');
  const clip = impact ?? manifest.clips.find((c) => c.name === 'whole');
  if (!clip) throw new Error('the effect has no whole clip');
  return { ...cut(clip), offset: clip.offset, delayFrames: impact ? 0 : clip.start_frame, frameMs: manifest.frame_ms };
}

/** An effect's projectile, cut from its sheet: the thing in flight, moved in code from the actor to the target (rule 35). */
export interface ProjectileLayout {
  readonly sheet: string;
  readonly frames: readonly Rect[];
  readonly frameMs: number;
  /** How far above the target's feet the middle of the projectile lands. */
  readonly height: number;
  /** How high its path rises at the middle, as a share of the distance flown: none for an arrow, a little for a rock. */
  readonly arc: number;
}

/** The projectile clip of an effect, or null for an effect that has none. */
export function projectileLayout(manifest: EffectManifest): ProjectileLayout | null {
  const clip = manifest.clips.find((c) => c.role === 'projectile');
  if (!clip) return null;
  // The workbench's own path, a frame at a time: its highest point against its length is the arc to keep at any distance.
  const moves = clip.moves ?? [];
  const span = Math.max(0, ...moves.map((m) => Math.abs(m.x)));
  const rise = Math.max(0, ...moves.map((m) => -m.y));
  return { ...cut(clip), frameMs: manifest.frame_ms, height: -(clip.offset.y + clip.frame.h / 2), arc: span > 0 ? rise / span : 0 };
}

/** The frame of an effect `ms` after its action resolved, -1 before its first, or null once it is over. */
export function effectFrameAt(layout: EffectLayout, ms: number): number | null {
  const index = Math.floor(ms / layout.frameMs) - layout.delayFrames;
  if (index >= layout.frames.length) return null;
  return Math.max(-1, index);
}

/**
 * The frame of an act, or of the weapon swung with it, at `simTime`: the
 * frames up to `hold` from the declaration, `hold` until the action
 * resolves, then the rest; past the last, null. The actor and its weapon
 * each keep their own hold frame, so both reach the blow and stay there
 * together. `lead` gives the frames before the hold their own lengths,
 * for a weapon whose motion is not even, such as a bow's quick release
 * (rule 33); a frame it does not name lasts `frameMs`.
 */
export function heldFrame(
  simTime: number,
  act: { readonly from: number; readonly resolve: number },
  hold: number,
  count: number,
  frameMs: number,
  lead: readonly number[] = [],
): number | null {
  if (simTime >= act.resolve) {
    const index = hold + 1 + Math.floor((simTime - act.resolve) / frameMs);
    return index < count ? index : null;
  }
  let index = 0;
  for (let left = simTime - act.from; index < hold; index++) {
    left -= lead[index] ?? frameMs;
    if (left < 0) break;
  }
  return index < count ? index : null;
}

/** How long after an action is declared its hold frame begins: when a projectile leaves the hand or the string. */
export function releaseMs(hold: number, frameMs: number, lead: readonly number[] = []): number {
  return sum(range(hold).map((i) => lead[i] ?? frameMs));
}

/**
 * How far along its flight a projectile is at `simTime`, from 0 as it is
 * let go to 1 as it lands: it leaves `release` after the action is
 * declared and lands as the action resolves, so its flight is what is left
 * of the warmup (rule 35). Null before it is let go and once it has landed.
 * An action that resolves before its release has no flight to show.
 */
export function flightAt(simTime: number, act: { readonly from: number; readonly resolve: number }, release: number): number | null {
  const start = act.from + release;
  if (simTime < start || simTime >= act.resolve) return null;
  return (simTime - start) / (act.resolve - start);
}

/** Where a projectile is, `progress` along the straight line between two points, lifted by its arc. */
export function flightPoint(from: { readonly x: number; readonly y: number }, to: { readonly x: number; readonly y: number }, progress: number, arc: number): { x: number; y: number } {
  const lift = 4 * arc * Math.abs(to.x - from.x) * progress * (1 - progress);
  return { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress - lift };
}
