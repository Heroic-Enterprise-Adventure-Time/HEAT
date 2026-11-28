import { ADVENTURE_OUTCOMES, UNLOCK_IDS, UNLOCKS } from '@heat/engine';

import { earnedWords, resultTitle } from './result-words';

describe("the title of a result's dialog (Issue-441)", () => {
  it('says how the adventure ended, in a word of its own for each way the engine ends one', () => {
    expect(ADVENTURE_OUTCOMES.map(resultTitle)).toEqual(['Victory!', 'Retreat!', 'Defeat!']);
  });

  it('says an adventure with no outcome was lost, as one a game update discarded is', () => {
    expect(resultTitle(null)).toBe('Adventure lost');
  });

  it("passes on an outcome this client's engine lacks, as a newer deploy may send", () => {
    expect(resultTitle('abandoned')).toBe('abandoned');
  });
});

describe('what a result says of an unlock (Issue-352)', () => {
  it("tells each of the player's unlocks that names this adventure as the one that first earned it, in the content's words", () => {
    for (const unlock of UNLOCK_IDS) expect(earnedWords([{ unlock, adventureId: 'a1' }], 'a1'), unlock).toEqual([UNLOCKS[unlock].earned]);
  });

  it('says nothing of one the player held already: it names the adventure that first earned it, not this one', () => {
    for (const unlock of UNLOCK_IDS) expect(earnedWords([{ unlock, adventureId: 'a0' }], 'a1'), unlock).toEqual([]);
  });

  it("says nothing while the player's unlocks have not been read again, or for a player who holds none", () => {
    expect(earnedWords([], 'a1')).toEqual([]);
  });

  it("leaves out an unlock this client's content does not know, as a newer deploy may send, and keeps the ones it does", () => {
    const held = ['an-unlock-of-a-later-deploy', ...UNLOCK_IDS].map((unlock) => ({ unlock, adventureId: 'a1' }));
    expect(earnedWords(held, 'a1')).toEqual(UNLOCK_IDS.map((unlock) => UNLOCKS[unlock].earned));
  });
});
