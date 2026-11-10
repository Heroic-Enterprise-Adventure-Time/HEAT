/**
 * The arithmetic of an action's two sprites (game.md, "How the game looks";
 * docs/process/assets.md, rules 32 to 35), apart from the renderer so that
 * it is tested without one: which frame of an act, or of the weapon swung
 * with it, shows at a time on the adventure's clock, and which frame of an
 * effect shows a while after it began, and where.
 */
import { range } from 'es-toolkit';
import * as z from 'zod/mini';

/** PixelLab's game pack manifest, as much of it as the battle reads: the whole effect, without the sprite; checked where it is fetched (angular.md, rule 4). */
export const EffectManifestSchema = z.object({
  frame_ms: z.number(),
  clips: z.array(
    z.object({
      name: z.string(),
      start_frame: z.number(),
      frames: z.number(),
      frame: z.object({ w: z.number(), h: z.number() }),
      sheets: z.array(z.object({ file: z.string(), first_frame: z.number(), frames: z.number(), columns: z.number() })),
      offset: z.object({ x: z.number(), y: z.number() }),
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

export function effectLayout(manifest: EffectManifest): EffectLayout {
  const whole = manifest.clips.find((c) => c.name === 'whole');
  const sheet = whole?.sheets[0];
  if (!whole || !sheet) throw new Error('the effect has no whole clip');
  const { w, h } = whole.frame;
  const frames = range(whole.frames).map((i) => ({
    x: (i % sheet.columns) * w,
    y: Math.floor(i / sheet.columns) * h,
    width: w,
    height: h,
  }));
  return { sheet: sheet.file, frames, offset: whole.offset, delayFrames: whole.start_frame, frameMs: manifest.frame_ms };
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
 * together.
 */
export function heldFrame(simTime: number, act: { readonly from: number; readonly resolve: number }, hold: number, count: number, frameMs: number): number | null {
  const index =
    simTime < act.resolve ? Math.min(hold, Math.floor((simTime - act.from) / frameMs)) : hold + 1 + Math.floor((simTime - act.resolve) / frameMs);
  return index < count ? Math.max(0, index) : null;
}
