import { UNLOCK_IDS, UNLOCKS } from '@heat/engine';

import { earnedWords } from './result-words';

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
