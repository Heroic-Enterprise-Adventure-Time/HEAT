import { describe, expect, it } from 'vitest';

import { must } from '@heat/engine';

import {
  drawnFrame,
  effectFrameAt,
  effectLayout,
  type EffectManifest,
  effectMs,
  flightMs,
  flightPoint,
  flyingAt,
  followFrame,
  followMs,
  heldPoint,
  leadFrame,
  nockedAt,
  projectileLayout,
  releaseAfter,
  releaseMs,
  type Thrower,
} from './action-sprites';

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

  it('lasts from the resolve to the end of its last frame, the wait included', () => {
    expect(effectMs(layout)).toBe(71 * 6);
    expect(effectFrameAt(layout, effectMs(layout) - 1)).toBe(4);
    expect(effectFrameAt(layout, effectMs(layout))).toBeNull();
  });
});

describe('an act up to its ready frame', () => {
  it('plays the frames before it from the declaration, then waits on it for as long as the action takes to resolve', () => {
    expect(leadFrame(0, 2, 5, 90)).toBe(0);
    expect(leadFrame(90, 2, 5, 90)).toBe(1);
    expect(leadFrame(180, 2, 5, 90)).toBe(2);
    expect(leadFrame(299, 2, 5, 90)).toBe(2);
    expect(leadFrame(60_000, 2, 5, 90)).toBe(2);
  });

  it('keeps an actor and its weapon on their own ready frames through the same act', () => {
    // A three-frame act that waits on 1 and a five-frame swing that waits on 2 are both at their blow while the action warms up.
    expect(leadFrame(250, 1, 3, 90)).toBe(1);
    expect(leadFrame(250, 2, 5, 90)).toBe(2);
  });

  it('shows nothing for a ready frame the clip does not have', () => {
    expect(leadFrame(500, 3, 3, 90)).toBeNull();
  });
});

describe('an act after its action resolves', () => {
  it('plays the frames after its ready frame from that moment, one a frame length, and is then over', () => {
    expect(followFrame(0, 2, 5, 90)).toBe(3);
    expect(followFrame(89, 2, 5, 90)).toBe(3);
    expect(followFrame(90, 2, 5, 90)).toBe(4);
    expect(followFrame(180, 2, 5, 90)).toBeNull();
  });

  it('lasts as long as those frames, which is what the clock waits for', () => {
    expect(followMs(2, 5, 90)).toBe(180);
    expect(followFrame(followMs(2, 5, 90) - 1, 2, 5, 90)).toBe(4);
    expect(followFrame(followMs(2, 5, 90), 2, 5, 90)).toBeNull();
  });

  it('is nothing for an act that ends on its ready frame', () => {
    expect(followMs(4, 5, 90)).toBe(0);
    expect(followFrame(0, 4, 5, 90)).toBeNull();
  });

  it('skips the wait of an action that resolves as it is declared: the frame after the ready one shows at once', () => {
    expect(followFrame(0, 1, 3, 90)).toBe(2);
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
    // Its length is the impact's alone: the flight before it is waited for on its own.
    expect(effectMs(layout)).toBe(83 * 5);
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

describe('a bow, whose frames differ in length', () => {
  // The bow as its provenance records it: four frames of draw, two quick ones of release, and the hold on the seventh, at rest.
  const lead = [90, 90, 90, 90, 45, 45];
  const grips = [{ x: 23, y: 14 }, { x: 22, y: 14 }, { x: 22, y: 14 }, { x: 23, y: 14 }, { x: 24, y: 14 }, { x: 23, y: 14 }, { x: 23, y: 14 }];
  const nocks = [{ x: 13, y: 14 }, { x: 9, y: 14 }, { x: 7, y: 14 }, { x: 5, y: 14 }, { x: 7, y: 14 }, { x: 10, y: 15 }, { x: 13, y: 14 }];

  it('waits at its full draw, the frame before the hold where the string is furthest back', () => {
    expect(drawnFrame(grips, nocks, 6)).toBe(3);
    // A weapon with nothing before its hold waits on its first frame.
    expect(drawnFrame(grips, nocks, 0)).toBe(0);
  });

  it("draws to it at the act's pace and waits there while the action warms up", () => {
    expect(leadFrame(269, 3, 7, 90, lead)).toBe(2);
    expect(leadFrame(270, 3, 7, 90, lead)).toBe(3);
    expect(leadFrame(700, 3, 7, 90, lead)).toBe(3);
  });

  it('looses when the action resolves, each frame of the release for its own length, and comes to rest', () => {
    expect(followFrame(0, 3, 7, 90, lead)).toBe(4);
    expect(followFrame(44, 3, 7, 90, lead)).toBe(4);
    expect(followFrame(45, 3, 7, 90, lead)).toBe(5);
    expect(followFrame(90, 3, 7, 90, lead)).toBe(6);
    expect(followFrame(179, 3, 7, 90, lead)).toBe(6);
    expect(followFrame(180, 3, 7, 90, lead)).toBeNull();
    expect(followMs(3, 7, 90, lead)).toBe(180);
  });

  it('lets the arrow go as it reaches its hold frame, the release after the resolve', () => {
    expect(releaseAfter(3, 6, 90, lead)).toBe(90);
    expect(followFrame(releaseAfter(3, 6, 90, lead), 3, 7, 90, lead)).toBe(6);
    // A hand about to throw waits on its hold frame, and lets go as the action resolves.
    expect(releaseAfter(3, 3, 90)).toBe(0);
  });

  it('takes as long to wind up as the frames before its hold', () => {
    expect(releaseMs(6, 90, lead)).toBe(450);
    expect(releaseMs(3, 90)).toBe(270);
    expect(releaseMs(0, 90)).toBe(0);
  });
});

describe('a projectile in flight', () => {
  const layout = must(projectileLayout(thrown), 'the projectile clip');
  const hand = { x: 10, y: -20 };
  const target = { x: 300, y: 120 };

  it('flies for what was left of the warmup after the wind-up, and not at all where the warmup is shorter', () => {
    expect(flightMs(700, 450)).toBe(250);
    expect(flightMs(600, 270)).toBe(330);
    expect(flightMs(200, 450)).toBe(0);
  });

  it('flies straight with no arc, and rises in the middle with one, either way across the stage', () => {
    expect(flightPoint({ x: 100, y: 50 }, { x: 200, y: 70 }, 0.5, 0)).toEqual({ x: 150, y: 60 });
    expect(flightPoint({ x: 100, y: 50 }, { x: 200, y: 50 }, 0.5, 0.125)).toEqual({ x: 150, y: 37.5 });
    expect(flightPoint({ x: 200, y: 50 }, { x: 100, y: 50 }, 0.5, 0.125)).toEqual({ x: 150, y: 37.5 });
    expect(flightPoint({ x: 100, y: 50 }, { x: 200, y: 50 }, 0, 0.125)).toEqual({ x: 100, y: 50 });
    expect(flightPoint({ x: 100, y: 50 }, { x: 200, y: 50 }, 1, 0.125)).toEqual({ x: 200, y: 50 });
  });

  it('leaves a bare hand and lands, its middle on the path, where the pack drew it on the target', () => {
    const goblin: Thrower = { feet: { x: 100, y: 120 }, facing: 1, hand, weapon: null };
    const start = heldPoint(goblin, null);
    expect(start).toEqual({ x: 110, y: 100, onString: false });
    // Nothing in the hand before it is let go.
    expect(nockedAt(goblin, 3)).toBeNull();
    expect(flyingAt(-1, 330, start, 1, target, layout)).toBeNull();
    // Let go from the hand: the sprite's tail half its width behind its middle.
    expect(flyingAt(0, 330, start, 1, target, layout)).toEqual({ x: 110 - 5, y: 100, frame: 0 });
    // Just before it lands: its middle at the landing point, over the feet and 24 above.
    const last = must(flyingAt(329.5, 330, start, 1, target, layout), 'the last point of the flight');
    expect(last.x).toBeCloseTo(300 - 5, 0);
    expect(last.y).toBeCloseTo(96, 0);
    expect(flyingAt(330, 330, start, 1, target, layout)).toBeNull();
  });

  it('has no flight to show where it flies for no time', () => {
    expect(flyingAt(0, 0, { x: 110, y: 100 }, 1, target, layout)).toBeNull();
  });

  it('plays its own frames through the flight', () => {
    const start = { x: 110, y: 100 };
    expect(flyingAt(83 * 2, 700, start, 1, target, layout)?.frame).toBe(2);
    expect(flyingAt(83 * 6, 700, start, 1, target, layout)?.frame).toBe(0);
  });

  it('is mirrored for the other side: let go to the left, its tail to the right', () => {
    const goblin: Thrower = { feet: { x: 300, y: 120 }, facing: -1, hand, weapon: null };
    const hero = { x: 100, y: 120 };
    const start = heldPoint(goblin, null);
    expect(flyingAt(0, 330, start, -1, hero, layout)).toEqual({ x: 290 + 5, y: 100, frame: 0 });
    expect(must(flyingAt(329.5, 330, start, -1, hero, layout), 'the last point of the flight').x).toBeCloseTo(100 + 5, 0);
  });

  it("sits on a bow's string, its tail on the frame's nock, and leaves from the nock of the frame it is let go on", () => {
    const grips = [{ x: 20, y: 20 }, { x: 20, y: 20 }, { x: 20, y: 20 }];
    const nocks = [{ x: 18, y: 20 }, { x: 14, y: 21 }, { x: 18, y: 20 }];
    const ranger: Thrower = { feet: { x: 100, y: 120 }, facing: 1, hand, weapon: { grips, nocks } };
    // The second frame, the string drawn 6 back and 1 down from the grip; the half pixel rounds down the screen.
    expect(nockedAt(ranger, 1)).toEqual({ x: 110 - 6, y: Math.round(100 + 1 + 0.5), frame: 0 });
    // Let go on the third frame, the string 2 back: off the string and into its flight.
    expect(flyingAt(0, 250, heldPoint(ranger, 2), 1, target, layout)).toEqual({ x: 110 - 2 - 5, y: Math.round(100.5), frame: 0 });
  });

  it('shows nothing on a weapon with no nock, and leaves from the hand', () => {
    const slinger: Thrower = { feet: { x: 100, y: 120 }, facing: 1, hand, weapon: { grips: [{ x: 0, y: 0 }], nocks: null } };
    expect(nockedAt(slinger, 0)).toBeNull();
    expect(heldPoint(slinger, 0)).toEqual({ x: 110, y: 100, onString: false });
  });
});
