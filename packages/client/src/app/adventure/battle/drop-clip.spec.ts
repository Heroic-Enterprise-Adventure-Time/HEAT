import { range } from 'es-toolkit';
import { describe, expect, it } from 'vitest';

import { clipHold } from './clip-hold';
import { amountRow, DROP_FADE_MS, DROP_RISE, DROP_RISE_MS, DROP_STAGGER_MS, dropAt, dropTime } from './drop-clip';

describe('dropTime', () => {
  it('begins the first drop with its enemy’s fall, and lasts as long as the rise', () => {
    expect(dropTime(0, 0)).toEqual({ from: 0, until: DROP_RISE_MS });
  });

  it('waits, as the fall does, for the blow or the projectile that felled the enemy to land', () => {
    expect(dropTime(0, 270)).toEqual({ from: 270, until: 270 + DROP_RISE_MS });
  });

  it('begins each further drop of one enemy a stagger after the last', () => {
    expect([0, 1, 2].map((index) => dropTime(index, 100).from)).toEqual([100, 100 + DROP_STAGGER_MS, 100 + 2 * DROP_STAGGER_MS]);
  });
});

describe('the hold a drop asks for', () => {
  /** The clips a frame begins where an enemy falls for fallMs and drops count things, the blow landing delay from now. */
  const clips = (fallMs: number, count: number, delay: number) => [delay + fallMs, ...range(count).map((index) => dropTime(index, delay).until)];

  it('is the whole of the rise where the fall is shorter', () => {
    expect(clipHold(clips(400, 1, 0), 1)).toBe(DROP_RISE_MS);
    expect(clipHold(clips(400, 1, 270), 1)).toBe(270 + DROP_RISE_MS);
  });

  it('is the fall’s where the fall is longer: the two play together, and the clock waits for the longer, not their sum', () => {
    expect(clipHold(clips(900, 1, 0), 1)).toBe(900);
  });

  it('is the fall’s alone where nothing dropped', () => {
    expect(clipHold(clips(400, 0, 0), 1)).toBe(400);
  });

  it('reaches to the end of the last of several drops', () => {
    expect(clipHold(clips(400, 2, 0), 1)).toBe(DROP_STAGGER_MS + DROP_RISE_MS);
  });
});

describe('dropAt', () => {
  it('shows nothing before the drop begins and once it is gone', () => {
    expect(dropAt(-1)).toBeNull();
    expect(dropAt(DROP_RISE_MS)).toBeNull();
    expect(dropAt(DROP_RISE_MS + 1000)).toBeNull();
  });

  it('begins whole, where the enemy fell', () => {
    expect(dropAt(0)).toEqual({ lift: 0, alpha: 1 });
  });

  it('rises quickly at first and slows: past half the way by half the time', () => {
    const half = dropAt(DROP_RISE_MS / 2);
    expect(half?.lift).toBeGreaterThan(DROP_RISE / 2);
    expect(half?.lift).toBeLessThan(DROP_RISE);
  });

  it('never sinks, and moves by whole art pixels', () => {
    let last = 0;
    for (let ms = 0; ms < DROP_RISE_MS; ms += 10) {
      const lift = dropAt(ms)?.lift ?? Number.NaN;
      expect(Number.isInteger(lift)).toBe(true);
      expect(lift).toBeGreaterThanOrEqual(last);
      last = lift;
    }
    expect(last).toBe(DROP_RISE);
  });

  it('shows whole until the fade, then fades to nothing by the end', () => {
    expect(dropAt(DROP_RISE_MS - DROP_FADE_MS)?.alpha).toBe(1);
    expect(dropAt(DROP_RISE_MS - DROP_FADE_MS / 2)?.alpha).toBeCloseTo(0.5);
    expect(dropAt(DROP_RISE_MS - 1)?.alpha).toBeLessThan(0.05);
  });
});

describe('amountRow', () => {
  const widths: Readonly<Record<string, number>> = { '1': 4, '3': 6, '6': 6 };
  const widthOf = (digit: string) => widths[digit];

  it('stands one digit at the row’s left edge, the row as wide as its picture', () => {
    expect(amountRow(3, widthOf)).toEqual({ digits: [{ digit: '3', x: 0 }], width: 6 });
  });

  it('stands each next digit so that its outline shares a column with the last one’s', () => {
    expect(amountRow(36, widthOf)).toEqual({ digits: [{ digit: '3', x: 0 }, { digit: '6', x: 5 }], width: 11 });
    expect(amountRow(136, widthOf)).toEqual({ digits: [{ digit: '1', x: 0 }, { digit: '3', x: 3 }, { digit: '6', x: 8 }], width: 14 });
  });

  it('leaves out a digit the font has no picture of', () => {
    expect(amountRow(30, widthOf)).toEqual({ digits: [{ digit: '3', x: 0 }], width: 6 });
    expect(amountRow(0, widthOf)).toEqual({ digits: [], width: 0 });
  });
});
