import type { AdventureEvent } from '@heat/engine';

import type { FrameLoop } from '../adventure/battle-view';
import type { BattleSceneCallbacks } from '../adventure/battle/battle-scene';
import type { CastMember } from '../adventure/cast';
import { type Field, isEntry } from '../adventure/field';

/**
 * A battle scene that draws nothing, since jsdom has no WebGL, and records
 * what it was given. By default it says everyone is on at once, as if the
 * rush in took no time; `holding` keeps an entry waiting until the test
 * calls `release`. A run's art is there at once too, unless `awaitingArt`,
 * which keeps every `prepare` waiting until the test calls `artArrives`.
 * It asks the clock to wait for nothing, as if no clip took any time, unless
 * the test sets `holdFor`, which answers the wait for the events of a frame.
 */
export function fakeBattleScene(holding = false, awaitingArt = false) {
  let callbacks: BattleSceneCallbacks | null = null;
  const waiting: (() => void)[] = [];
  const scene = {
    /** The cast of each run handed over, in order. */
    prepared: [] as (readonly CastMember[])[],
    resets: [] as { field: Field; sets: ReadonlyMap<string, string>; enter: boolean }[],
    fed: [] as AdventureEvent[],
    frames: 0,
    /** How long the clock should wait for the clips a frame's events begin, in presentation milliseconds. */
    holdFor: (_events: readonly AdventureEvent[]): number => 0,
    release: () => callbacks?.onEntered(),
    /** The art every run handed over so far was waiting for is in, and the page has been told. */
    artArrives: async () => {
      for (const arrive of waiting.splice(0)) arrive();
      await Promise.resolve();
    },
    factory: (_host: HTMLElement, given: BattleSceneCallbacks) => {
      callbacks = given;
      return Promise.resolve({
        prepare: (cast: readonly CastMember[]) => {
          scene.prepared.push(cast);
          return awaitingArt ? new Promise<void>((resolve) => waiting.push(resolve)) : Promise.resolve();
        },
        reset: (field: Field, sets: ReadonlyMap<string, string>, enter: boolean) => {
          scene.resets.push({ field, sets, enter });
          if (enter && !holding) given.onEntered();
        },
        feed: (events: readonly AdventureEvent[]) => {
          scene.fed.push(...events);
          if (events.some(isEntry) && !holding) given.onEntered();
          return scene.holdFor(events);
        },
        frame: () => {
          scene.frames++;
        },
        destroy: () => undefined,
      });
    },
  };
  return scene;
}

/** The longest frame the fake loop runs, the page's own limit (`MAX_FRAME_MS` in `battle-view.ts`). */
const FRAME_MS = 250;

/** Whether a frame's events land a blow, a hit, a harvest or a guard: what the scene begins a hit or an effect for, and asks the clock to wait for. */
export const landsBlow = (events: readonly AdventureEvent[]) =>
  events.some((event) => event.kind === 'action-resolved' && event.effects.some((effect) => effect.kind !== 'move'));

/**
 * Runs a frame at a time until the scene is fed a blow it had not been, and
 * answers how many events it has been fed by the end of that frame, so that
 * a test can say what the clock does next.
 */
export async function runToBlow(run: (ms: number) => Promise<void>, scene: { readonly fed: readonly AdventureEvent[] }): Promise<number> {
  const from = scene.fed.length;
  for (let frame = 0; frame < 100; frame++) {
    await run(FRAME_MS);
    if (landsBlow(scene.fed.slice(from))) return scene.fed.length;
  }
  throw new Error('no blow landed in 100 frames');
}

/** A frame loop the test drives by hand: `advance` runs `ms` of wall-clock time in frames of at most 250 ms, as the browser would. */
export function fakeFrameLoop() {
  let onFrame: (ms: number) => void = () => undefined;
  const loop: FrameLoop = (given) => {
    onFrame = given;
    return () => undefined;
  };
  return {
    loop,
    advance: (ms: number) => {
      for (let left = ms; left > 0; left -= FRAME_MS) onFrame(Math.min(FRAME_MS, left));
    },
  };
}
