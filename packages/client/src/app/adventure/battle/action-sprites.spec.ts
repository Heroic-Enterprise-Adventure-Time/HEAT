import { describe, expect, it } from 'vitest';

import { must } from '@heat/engine';

import { effectFrameAt, effectLayout, type EffectManifest, flightAt, flightPoint, heldFrame, projectileAt, projectileLayout, releaseMs, type Thrower } from './action-sprites';

const manifest: EffectManifest = {
  frame_ms: 71,
  clips: [
    {
      name: 'whole-with-sprite',
      start_frame: 0,
      frames: 12,
      frame: { w: 67, h: 81 },
      sheets: [{ file: 'whole-with-sprite.png', first_frame: 0, frames: 12, columns: 4 }],
      offset: { x: -36, y: -55 },
    },
    {
      name: 'whole',
      start_frame: 1,
      frames: 5,
      frame: { w: 61, h: 46 },
      sheets: [{ file: 'whole.png', first_frame: 0, frames: 5, columns: 3 }],
      offset: { x: -33, y: -23 },
    },
  ],
};

describe('effectLayout', () => {
  it('cuts the whole clip from its sheet, left to right and top to bottom', () => {
    const layout = effectLayout(manifest);
    expect(layout.sheet).toBe('whole.png');
    expect(layout.frames).toEqual([
      { x: 0, y: 0, width: 61, height: 46 },
      { x: 61, y: 0, width: 61, height: 46 },
      { x: 122, y: 0, width: 61, height: 46 },
      { x: 0, y: 46, width: 61, height: 46 },
      { x: 61, y: 46, width: 61, height: 46 },
    ]);
    expect(layout.offset).toEqual({ x: -33, y: -23 });
    expect(layout.delayFrames).toBe(1);
  });

  it('refuses a pack without the whole effect', () => {
    expect(() => effectLayout({ frame_ms: 63, clips: [] })).toThrow();
  });
});

describe('effectFrameAt', () => {
  const layout = effectLayout(manifest);

  it('waits out the frames before the first drawn one, then plays once', () => {
    expect(effectFrameAt(layout, 0)).toBe(-1);
    expect(effectFrameAt(layout, 70)).toBe(-1);
    expect(effectFrameAt(layout, 71)).toBe(0);
    expect(effectFrameAt(layout, 71 * 5)).toBe(4);
    expect(effectFrameAt(layout, 71 * 6)).toBeNull();
  });
});

describe('heldFrame', () => {
  const act = { from: 1000, resolve: 1300 };

  it('plays up to the hold frame and holds it until the action resolves', () => {
    expect(heldFrame(1000, act, 2, 5, 90)).toBe(0);
    expect(heldFrame(1090, act, 2, 5, 90)).toBe(1);
    expect(heldFrame(1180, act, 2, 5, 90)).toBe(2);
    expect(heldFrame(1299, act, 2, 5, 90)).toBe(2);
  });

  it('plays the rest after it resolves, then is over', () => {
    expect(heldFrame(1300, act, 2, 5, 90)).toBe(3);
    expect(heldFrame(1390, act, 2, 5, 90)).toBe(4);
    expect(heldFrame(1480, act, 2, 5, 90)).toBeNull();
  });

  it('keeps an actor and its weapon on their own hold frames through the same act', () => {
    // A three-frame act held on 1 and a five-frame swing held on 2 are both at their blow while the action warms up.
    expect(heldFrame(1250, act, 1, 3, 90)).toBe(1);
    expect(heldFrame(1250, act, 2, 5, 90)).toBe(2);
  });

  it('skips the hold of an action that resolves as it is declared', () => {
    expect(heldFrame(1000, { from: 1000, resolve: 1000 }, 1, 3, 90)).toBe(2);
  });
});

/** A thrown effect's pack, as the rock's is: the whole clip, the projectile in place with the workbench's path, and the impact after it. */
const thrown: EffectManifest = {
  frame_ms: 83,
  clips: [
    { name: 'whole', start_frame: 0, frames: 11, frame: { w: 60, h: 32 }, sheets: [{ file: 'whole.png', first_frame: 0, frames: 11, columns: 4 }], offset: { x: -45, y: -31 } },
    {
      name: 'part-projectile',
      role: 'projectile',
      start_frame: 0,
      frames: 6,
      frame: { w: 10, h: 10 },
      sheets: [{ file: 'part-projectile.png', first_frame: 0, frames: 6, columns: 3 }],
      offset: { x: -45, y: -28 },
      moves: [{ x: 0, y: 0 }, { x: 10, y: -3 }, { x: 20, y: -5 }, { x: 30, y: -4 }, { x: 40, y: -1 }],
    },
    {
      name: 'part-debris_burst',
      role: 'impact',
      start_frame: 6,
      frames: 5,
      frame: { w: 42, h: 32 },
      sheets: [{ file: 'part-debris_burst.png', first_frame: 0, frames: 5, columns: 3 }],
      offset: { x: -18, y: -31 },
    },
  ],
};

describe('an effect with a projectile', () => {
  it('plays its impact on the target from the moment it lands, not the whole effect after a wait', () => {
    const layout = effectLayout(thrown);
    expect(layout.sheet).toBe('part-debris_burst.png');
    expect(layout.frames).toHaveLength(5);
    expect(layout.offset).toEqual({ x: -18, y: -31 });
    expect(layout.delayFrames).toBe(0);
    expect(effectFrameAt(layout, 0)).toBe(0);
  });

  it('cuts its projectile, lands its middle where the pack\'s own path ends, and keeps the arc of that path', () => {
    const projectile = projectileLayout(thrown);
    expect(projectile?.sheet).toBe('part-projectile.png');
    expect(projectile?.frames).toHaveLength(6);
    // The clip's corner at the path's start, the last move, and half a frame: over the feet, 24 above.
    expect(projectile?.landing).toEqual({ x: -45 + 40 + 5, y: -28 - 1 + 5 });
    expect(projectile?.arc).toBe(5 / 40);
  });

  it('has none where no clip is a projectile, and no arc where the path is flat', () => {
    expect(projectileLayout(manifest)).toBeNull();
    const flat = { ...thrown, clips: thrown.clips.map((c) => (c.moves ? { ...c, moves: [{ x: 0, y: 0 }, { x: 35, y: 0 }] } : c)) };
    expect(projectileLayout(flat)?.arc).toBe(0);
  });
});

describe('a weapon whose frames differ in length', () => {
  const act = { from: 1000, resolve: 1700 };
  // The bow: four frames of draw, two quick ones of release, held on the seventh.
  const lead = [90, 90, 90, 90, 45, 45];

  it('plays each frame before the hold for its own length', () => {
    expect(heldFrame(1359, act, 6, 7, 90, lead)).toBe(3);
    expect(heldFrame(1360, act, 6, 7, 90, lead)).toBe(4);
    expect(heldFrame(1405, act, 6, 7, 90, lead)).toBe(5);
    expect(heldFrame(1450, act, 6, 7, 90, lead)).toBe(6);
    expect(heldFrame(1699, act, 6, 7, 90, lead)).toBe(6);
    expect(heldFrame(1700, act, 6, 7, 90, lead)).toBeNull();
  });

  it('reaches its hold frame after the frames before it', () => {
    expect(releaseMs(6, 90, lead)).toBe(450);
    expect(releaseMs(3, 90)).toBe(270);
    expect(releaseMs(0, 90)).toBe(0);
  });
});

describe('a projectile in flight', () => {
  const act = { from: 1000, resolve: 1700 };

  it('leaves at the release and lands as the action resolves', () => {
    expect(flightAt(1449, act, 450)).toBeNull();
    expect(flightAt(1450, act, 450)).toBe(0);
    expect(flightAt(1575, act, 450)).toBe(0.5);
    expect(flightAt(1700, act, 450)).toBeNull();
  });

  it('has no flight when the action resolves before the release', () => {
    expect(flightAt(1100, { from: 1000, resolve: 1200 }, 450)).toBeNull();
    expect(flightAt(1450, { from: 1000, resolve: 1200 }, 450)).toBeNull();
  });

  it('flies straight with no arc, and rises in the middle with one, either way across the stage', () => {
    expect(flightPoint({ x: 100, y: 50 }, { x: 200, y: 70 }, 0.5, 0)).toEqual({ x: 150, y: 60 });
    expect(flightPoint({ x: 100, y: 50 }, { x: 200, y: 50 }, 0.5, 0.125)).toEqual({ x: 150, y: 37.5 });
    expect(flightPoint({ x: 200, y: 50 }, { x: 100, y: 50 }, 0.5, 0.125)).toEqual({ x: 150, y: 37.5 });
    expect(flightPoint({ x: 100, y: 50 }, { x: 200, y: 50 }, 0, 0.125)).toEqual({ x: 100, y: 50 });
    expect(flightPoint({ x: 100, y: 50 }, { x: 200, y: 50 }, 1, 0.125)).toEqual({ x: 200, y: 50 });
  });
});

describe('where a projectile is drawn', () => {
  const layout = must(projectileLayout(thrown), 'the projectile clip');
  const act = { from: 1000, resolve: 1700 };
  const hand = { x: 10, y: -20 };
  const target = { x: 300, y: 120 };

  it('leaves a bare hand at the act\'s hold frame and lands, its middle on the path, where the pack drew it on the target', () => {
    const goblin: Thrower = { feet: { x: 100, y: 120 }, facing: 1, hand, actHold: 3, weapon: null };
    // Nothing in the hand before the release, at 270 ms.
    expect(projectileAt(1269, act, 90, goblin, target, layout)).toBeNull();
    // Let go from the hand: the sprite's tail half its width behind its middle.
    expect(projectileAt(1270, act, 90, goblin, target, layout)).toEqual({ x: 110 - 5, y: 100, frame: 0 });
    // Just before it lands: its middle at the landing point, over the feet and 24 above.
    const last = must(projectileAt(1699, act, 90, goblin, target, layout), 'the last point of the flight');
    expect(last.x).toBeCloseTo(300 - 5, 0);
    expect(last.y).toBeCloseTo(96, 0);
    expect(projectileAt(1700, act, 90, goblin, target, layout)).toBeNull();
  });

  it('plays its own frames through the flight', () => {
    const goblin: Thrower = { feet: { x: 100, y: 120 }, facing: 1, hand, actHold: 0, weapon: null };
    expect(projectileAt(1000 + 83 * 2, act, 90, goblin, target, layout)?.frame).toBe(2);
    expect(projectileAt(1000 + 83 * 6, act, 90, goblin, target, layout)?.frame).toBe(0);
  });

  it('is mirrored for the other side: let go to the left, its tail to the right', () => {
    const goblin: Thrower = { feet: { x: 300, y: 120 }, facing: -1, hand, actHold: 3, weapon: null };
    const hero = { x: 100, y: 120 };
    expect(projectileAt(1270, act, 90, goblin, hero, layout)).toEqual({ x: 290 + 5, y: 100, frame: 0 });
    expect(must(projectileAt(1699, act, 90, goblin, hero, layout), 'the last point of the flight').x).toBeCloseTo(100 + 5, 0);
  });

  it('sits on a bow\'s string, its tail on the frame\'s nock, until the bow\'s hold frame, then flies', () => {
    const grips = [{ x: 20, y: 20 }, { x: 20, y: 20 }, { x: 20, y: 20 }];
    const nocks = [{ x: 18, y: 20 }, { x: 14, y: 21 }, { x: 18, y: 20 }];
    const ranger: Thrower = { feet: { x: 100, y: 120 }, facing: 1, hand, actHold: 0, weapon: { holdFrame: 2, frames: 3, frameMs: [], grips, nocks } };
    // The second frame, the string drawn 6 back and 1 down from the grip; the half pixel rounds down the screen.
    expect(projectileAt(1100, act, 90, ranger, target, layout)).toEqual({ x: 110 - 6, y: Math.round(100 + 1 + 0.5), frame: 0 });
    // The hold frame begins at 180 ms: off the string and into its flight.
    expect(projectileAt(1180, act, 90, ranger, target, layout)).toEqual({ x: 110 - 2 - 5, y: Math.round(100.5), frame: 0 });
  });

  it('shows nothing before the release for a weapon with no nock', () => {
    const slinger: Thrower = { feet: { x: 100, y: 120 }, facing: 1, hand, actHold: 0, weapon: { holdFrame: 2, frames: 3, frameMs: [], grips: [{ x: 0, y: 0 }], nocks: null } };
    expect(projectileAt(1100, act, 90, slinger, target, layout)).toBeNull();
    expect(projectileAt(1180, act, 90, slinger, target, layout)).not.toBeNull();
  });
});
