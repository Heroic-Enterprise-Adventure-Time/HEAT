import { describe, expect, it } from 'vitest';

import { effectFrameAt, effectLayout, type EffectManifest, flightAt, flightPoint, heldFrame, projectileLayout, releaseMs } from './action-sprites';

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

  it('cuts its projectile, lands its middle where the pack drew it above the feet, and keeps the arc of the pack\'s own path', () => {
    const projectile = projectileLayout(thrown);
    expect(projectile?.sheet).toBe('part-projectile.png');
    expect(projectile?.frames).toHaveLength(6);
    expect(projectile?.height).toBe(23);
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
