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
      // The roles the battle reads; one it does not know is refused here, not played as the whole effect.
      role: z.optional(z.enum(['projectile', 'impact'])),
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
  /** Where the middle of the projectile lands from the target's feet, for an actor on the left: the end of the workbench's own path. */
  readonly landing: { readonly x: number; readonly y: number };
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
  const end = moves.at(-1) ?? { x: 0, y: 0 };
  const landing = { x: clip.offset.x + end.x + clip.frame.w / 2, y: clip.offset.y + end.y + clip.frame.h / 2 };
  return { ...cut(clip), frameMs: manifest.frame_ms, landing, arc: span > 0 ? rise / span : 0 };
}

/** The frame of an effect `ms` after its action resolved, -1 before its first, or null once it is over. */
export function effectFrameAt(layout: EffectLayout, ms: number): number | null {
  const index = Math.floor(ms / layout.frameMs) - layout.delayFrames;
  if (index >= layout.frames.length) return null;
  return Math.max(-1, index);
}

/** How long an effect lasts from the moment its action resolves: the frames it leaves empty, then the ones it draws. */
export function effectMs(layout: EffectLayout): number {
  return (layout.delayFrames + layout.frames.length) * layout.frameMs;
}

/**
 * The frame of an act, or of the weapon swung with it, `ms` after it began
 * to play, which is as its action resolved: the frames before `hold`, then
 * `hold`, the blow or the release, where it waits until the act and the
 * weapon are both at theirs, so that they strike together. `lead` gives a
 * frame its own length, for a weapon whose motion is not even, such as a
 * bow's quick release (rule 33); a frame it does not name lasts `frameMs`.
 * Null for a hold frame the clip does not have.
 */
export function leadFrame(ms: number, hold: number, count: number, frameMs: number, lead: readonly number[] = []): number | null {
  let index = 0;
  for (let left = ms; index < hold; index++) {
    left -= lead[index] ?? frameMs;
    if (left < 0) break;
  }
  return index < count ? index : null;
}

/**
 * The frame of an act, or of the weapon swung with it, `ms` after the blow
 * or the release: the frames after `hold`, one every `frameMs`; past the
 * last, null. The scene gives this and `leadFrame` presentation time, so
 * that an action is animated from its first frame to its last while the
 * adventure's clock waits for it (Issue-335, decision 0057).
 */
export function followFrame(ms: number, hold: number, count: number, frameMs: number): number | null {
  const index = hold + 1 + Math.floor(ms / frameMs);
  return index < count ? index : null;
}

/** How long the frames after `hold` last: what is left of an act, or of its weapon's swing, after the blow or the release. */
export function followMs(hold: number, count: number, frameMs: number): number {
  return Math.max(0, count - hold - 1) * frameMs;
}

/** How long the frames before `hold` last: how long after an act begins its blow lands, or its projectile leaves the hand or the string. */
export function releaseMs(hold: number, frameMs: number, lead: readonly number[] = []): number {
  return sum(range(hold).map((i) => lead[i] ?? frameMs));
}

interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * How long a projectile flies: what is left of its action's warmup after
 * the wind-up, so that a shot's wind-up and flight together last as long as
 * the engine warms it up, as decision 0052 timed it, now played as the
 * action resolves (decision 0057). Nothing for an action that warms up for
 * less than its wind-up takes.
 */
export function flightMs(warmup: number, windup: number): number {
  return Math.max(0, warmup - windup);
}

/** Where a projectile is, `progress` along the straight line between two points, lifted by its arc. */
export function flightPoint(from: Point, to: Point, progress: number, arc: number): { x: number; y: number } {
  const lift = 4 * arc * Math.abs(to.x - from.x) * progress * (1 - progress);
  return { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress - lift };
}

/** Whoever lets a projectile go: where it stands, which way it faces, and where its hand and its bow's string are. */
export interface Thrower {
  readonly feet: Point;
  /** 1 for the party, facing east; -1 for the other side, drawn mirrored. */
  readonly facing: 1 | -1;
  /** The leading hand from the feet, facing east. */
  readonly hand: Point;
  /** The weapon in hand, or null for none: a bow carries its nocks, where the arrow sits while it is drawn. */
  readonly weapon: {
    readonly grips: readonly Point[];
    readonly nocks: readonly Point[] | null;
  } | null;
}

/**
 * Where a projectile is held at the weapon's frame `index`: on the nock of
 * a bow, half a pixel down so that it rounds onto the string, or in the
 * hand itself where there is no bow, no nock on that frame, or no frame.
 */
export function heldPoint(from: Thrower, index: number | null): { x: number; y: number; onString: boolean } {
  const nock = index === null ? undefined : from.weapon?.nocks?.[index];
  const grip = index === null ? undefined : from.weapon?.grips[index];
  const onString = nock !== undefined && grip !== undefined;
  return {
    x: from.feet.x + from.facing * (from.hand.x + (onString ? nock.x - grip.x : 0)),
    y: from.feet.y + from.hand.y + (onString ? nock.y - grip.y + 0.5 : 0),
    onString,
  };
}

/**
 * Where an arrow's sprite goes while the bow is drawn (rule 35): its tail on
 * the nock of the bow's frame `index`, its first frame showing; null for a
 * unit with no bow, which shows nothing in its hand. The point is the
 * sprite's tail at its mid height, whole pixels, for a sprite mirrored when
 * `facing` is -1.
 */
export function nockedAt(from: Thrower, index: number | null): { x: number; y: number; frame: number } | null {
  const held = heldPoint(from, index);
  return held.onString ? { x: Math.round(held.x), y: Math.round(held.y), frame: 0 } : null;
}

/**
 * Where a projectile's sprite goes `ms` after it was let go from `start`,
 * and which of its frames shows (rule 35): along its flight to where the
 * workbench landed it on the target, its middle on the path, for `flight`
 * milliseconds; null before it leaves and once it has landed. The point is
 * the sprite's tail at its mid height, whole pixels, for a sprite mirrored
 * when `facing` is -1.
 */
export function flyingAt(
  ms: number,
  flight: number,
  start: Point,
  facing: 1 | -1,
  target: Point,
  layout: ProjectileLayout,
): { x: number; y: number; frame: number } | null {
  if (ms < 0 || ms >= flight) return null;
  const to = { x: target.x + facing * layout.landing.x, y: target.y + layout.landing.y };
  const at = flightPoint(start, to, ms / flight, layout.arc);
  const frame = Math.floor(ms / layout.frameMs) % layout.frames.length;
  const width = layout.frames[frame]?.width ?? 0;
  return { x: Math.round(at.x - (facing * width) / 2), y: Math.round(at.y), frame };
}
