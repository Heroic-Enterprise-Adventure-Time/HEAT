import { describe, expect, it } from 'vitest';

import { clipHold, spendHold } from './clip-hold';

describe('clipHold', () => {
  it('is the share of the one clip a frame starts', () => {
    expect(clipHold([420], 0.5)).toBe(210);
    expect(clipHold([700], 0.25)).toBe(175);
  });

  it('is the share of the longest of several, not of their sum', () => {
    // A blow's hit and its effect, and the fall of another unit in the same frame.
    expect(clipHold([420, 315, 700], 0.5)).toBe(350);
  });

  it('is nothing for a frame that starts no clip, and nothing at a share of none', () => {
    expect(clipHold([], 0.5)).toBe(0);
    expect(clipHold([420], 0)).toBe(0);
  });
});

describe('spendHold', () => {
  it('runs a hold down and leaves the run no time while it lasts', () => {
    expect(spendHold(210, 16)).toEqual({ held: 194, left: 0 });
  });

  it('runs down faster at a higher speed, since the time it is given is the wall clock times the speed', () => {
    expect(spendHold(210, 16 * 4)).toEqual({ held: 146, left: 0 });
  });

  it('hands the run what is left of the frame the hold ends in', () => {
    expect(spendHold(10, 16)).toEqual({ held: 0, left: 6 });
    expect(spendHold(16, 16)).toEqual({ held: 0, left: 0 });
  });

  it('hands the run the whole frame when nothing is held', () => {
    expect(spendHold(0, 16)).toEqual({ held: 0, left: 16 });
  });
});
