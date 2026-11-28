import { range } from 'es-toolkit';

import { MAX_PARTY } from '@heat/engine';

import { LAST_PARTY_PREFIX, loadLastParty, saveLastParty } from './last-party';

const WOLVES = 'wolves-on-the-mill-road';

describe("a job's last party, as the browser keeps it (Issue-440)", () => {
  it('answers what was saved, for that job at that location alone', () => {
    saveLastParty('millbrook', WOLVES, ['h1', 'h3']);
    expect(loadLastParty('millbrook', WOLVES)).toEqual(['h1', 'h3']);
    expect(loadLastParty('highcrag', WOLVES)).toEqual([]);
    expect(loadLastParty('millbrook', 'pick-up-sticks')).toEqual([]);
  });

  it('keeps only the last one saved', () => {
    saveLastParty('millbrook', WOLVES, ['h1', 'h3']);
    saveLastParty('millbrook', WOLVES, ['h2']);
    expect(loadLastParty('millbrook', WOLVES)).toEqual(['h2']);
  });

  it('answers nobody where nothing was kept', () => {
    expect(loadLastParty('millbrook', WOLVES)).toEqual([]);
  });

  it('answers nobody for what is not a list of ids, or is more than a full party', () => {
    const kept = (text: string) => {
      localStorage.setItem(`${LAST_PARTY_PREFIX}millbrook.${WOLVES}`, text);
      return loadLastParty('millbrook', WOLVES);
    };
    expect(kept('{not json')).toEqual([]);
    expect(kept(JSON.stringify({ heroes: ['h1'] }))).toEqual([]);
    expect(kept(JSON.stringify(['h1', 2]))).toEqual([]);
    expect(kept(JSON.stringify(range(MAX_PARTY + 1).map((i) => `h${i}`)))).toEqual([]);
    expect(kept(JSON.stringify(range(MAX_PARTY).map((i) => `h${i}`)))).toHaveLength(MAX_PARTY);
  });
});
