import { range } from 'es-toolkit';

import { COUNT_MS, COUNT_TOTAL_MS, countedAt, countMs } from './count-up';

describe('countedAt', () => {
  it('counts each amount up from nothing to its whole, one after the other', () => {
    expect(countedAt([60, 15], 0)).toEqual([{ shown: 0, done: false }, { shown: 0, done: false }]);
    expect(countedAt([60, 15], COUNT_MS)).toEqual([{ shown: 60, done: true }, { shown: 0, done: false }]);
    expect(countedAt([60, 15], 2 * COUNT_MS)).toEqual([{ shown: 60, done: true }, { shown: 15, done: true }]);
  });

  it('never shows less than it showed a moment before, and is past half its amount at half its time', () => {
    const shown = range(0, COUNT_MS + 1, 10).map((ms) => countedAt([1000], ms)[0]?.shown ?? -1);
    expect(shown).toEqual([...shown].sort((a, b) => a - b));
    expect(countedAt([1000], COUNT_MS / 2)[0]?.shown).toBeGreaterThan(500);
  });

  it('gives an amount of nothing no time: it is done when its turn comes, and the next begins at once', () => {
    expect(countedAt([60, 0, 15], COUNT_MS - 1)[1]).toEqual({ shown: 0, done: false });
    expect(countedAt([60, 0, 15], COUNT_MS)[1]).toEqual({ shown: 0, done: true });
    expect(countedAt([60, 0, 15], 2 * COUNT_MS)[2]).toEqual({ shown: 15, done: true });
    expect(countMs([60, 0, 15])).toBe(2 * COUNT_MS);
  });

  it('shares the longest a block may take among more amounts than fit', () => {
    const many = range(12).map(() => 40);
    expect(countMs(many)).toBe(COUNT_TOTAL_MS);
    expect(countedAt(many, COUNT_TOTAL_MS).every((counted) => counted.done)).toBe(true);
    expect(countedAt(many, COUNT_TOTAL_MS - 1).at(-1)?.done).toBe(false);
  });

  it('shows every amount whole past the end, as at once for a player who asked for less motion', () => {
    expect(countedAt([60, 0, 15], Infinity)).toEqual([{ shown: 60, done: true }, { shown: 0, done: true }, { shown: 15, done: true }]);
    expect(countedAt([], 0)).toEqual([]);
    expect(countMs([])).toBe(0);
  });
});
