import type { ReplayView } from '../game';
import { agoWords, partyWords, replayLine } from './replay-words';
import { outcomeWords } from './result-words';

const NOW = Date.parse('2026-11-12T12:00:00.000Z');
const before = (ms: number) => new Date(NOW - ms).toISOString();
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

describe('agoWords', () => {
  it('says how long ago in the largest whole unit, one or many', () => {
    expect(agoWords(before(MINUTE_MS), NOW)).toBe('1 minute ago');
    expect(agoWords(before(59 * MINUTE_MS), NOW)).toBe('59 minutes ago');
    expect(agoWords(before(HOUR_MS), NOW)).toBe('1 hour ago');
    expect(agoWords(before(DAY_MS - 1), NOW)).toBe('23 hours ago');
    expect(agoWords(before(DAY_MS), NOW)).toBe('1 day ago');
    expect(agoWords(before(6 * DAY_MS + 23 * HOUR_MS), NOW)).toBe('6 days ago');
  });

  it('says just now under a minute, and for a time ahead of this clock', () => {
    expect(agoWords(before(59_999), NOW)).toBe('just now');
    expect(agoWords(before(-5 * MINUTE_MS), NOW)).toBe('just now');
  });
});

describe('partyWords', () => {
  it('names each hero with its unit type and level, and says who died', () => {
    expect(
      partyWords([
        { name: 'Wat', unitType: 'fighter', level: 2, died: false },
        { name: 'Wren', unitType: 'villager', level: 1, died: true },
      ]),
    ).toBe('Wat (fighter, level 2), Wren (villager, level 1, died)');
  });
});

describe('outcomeWords', () => {
  it("says each of the engine's outcomes, and one it lacks as the hub put it", () => {
    expect(['complete', 'retreat', 'defeat', 'abandoned'].map(outcomeWords)).toEqual(['Job done', 'The party turned back', 'The party fell', 'abandoned']);
  });
});

describe('replayLine', () => {
  const replay: ReplayView = {
    id: 'a1',
    location: 'millbrook',
    settledAt: before(HOUR_MS),
    job: { id: 'wolves-on-the-mill-road', name: 'Wolves on the mill road' },
    result: { outcome: 'defeat', heroes: [{ heroId: 'x2', level: 4, dead: true }] },
    snapshot: {
      heroes: [
        { heroId: 'x1', name: 'Bram', unitType: 'fighter', level: 2 },
        { heroId: 'x2', name: 'Tansy', unitType: 'villager', level: 3 },
      ],
    },
  };

  it('keeps the order the party set out in, with the level and the death the result gave each hero', () => {
    expect(replayLine(replay)).toEqual({
      id: 'a1',
      job: 'Wolves on the mill road',
      outcome: 'defeat',
      settledAt: before(HOUR_MS),
      party: [
        { name: 'Bram', unitType: 'fighter', level: 2, died: false },
        { name: 'Tansy', unitType: 'villager', level: 4, died: true },
      ],
    });
  });

  it('has no line for a record not settled', () => {
    expect(replayLine({ ...replay, settledAt: null })).toBeNull();
    expect(replayLine({ ...replay, result: null })).toBeNull();
  });
});
