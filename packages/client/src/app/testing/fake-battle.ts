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
      for (let left = ms; left > 0; left -= 250) onFrame(Math.min(250, left));
    },
  };
}
