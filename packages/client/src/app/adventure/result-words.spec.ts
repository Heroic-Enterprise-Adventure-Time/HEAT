import { UNLOCK_IDS, UNLOCKS } from '@heat/engine';

import { earnedWords } from './result-words';

describe('what a result says of an unlock (Issue-352)', () => {
  it("tells each unlock the run earned that the player's own names this adventure for, in the content's words", () => {
    for (const unlock of UNLOCK_IDS) {
      expect(earnedWords([unlock], [{ unlock, adventureId: 'a1' }], 'a1'), unlock).toEqual([UNLOCKS[unlock].earned]);
    }
  });

  it('says nothing of one the player held already: their own names the adventure that first earned it, not this one', () => {
    for (const unlock of UNLOCK_IDS) expect(earnedWords([unlock], [{ unlock, adventureId: 'a0' }], 'a1'), unlock).toEqual([]);
  });

  it("says nothing while the player's unlocks have not been read again, or for a run that earned none", () => {
    expect(earnedWords([...UNLOCK_IDS], [], 'a1')).toEqual([]);
    expect(earnedWords([], UNLOCK_IDS.map((unlock) => ({ unlock, adventureId: 'a1' })), 'a1')).toEqual([]);
  });

  it('says nothing of an unlock the player holds from this adventure that the result does not list', () => {
    expect(earnedWords([], [{ unlock: 'road-to-highcrag', adventureId: 'a1' }], 'a1')).toEqual([]);
  });

  it("leaves out an unlock this client's content does not know, as a newer deploy may send, and keeps the ones it does", () => {
    const later = 'an-unlock-of-a-later-deploy';
    const held = [later, ...UNLOCK_IDS].map((unlock) => ({ unlock, adventureId: 'a1' }));
    expect(earnedWords([later, ...UNLOCK_IDS], held, 'a1')).toEqual(UNLOCK_IDS.map((unlock) => UNLOCKS[unlock].earned));
  });
});
