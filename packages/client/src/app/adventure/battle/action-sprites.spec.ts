import { describe, expect, it } from 'vitest';

import { effectFrameAt, effectLayout, type EffectManifest, heldFrame } from './action-sprites';

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
