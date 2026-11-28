import { heroGainWords, rewardWords } from './gain-words';

const wat = { name: 'Wat', unitType: 'fighter', level: 1 };

describe('what was gained, in words', () => {
  it('says an amount of a resource', () => {
    expect(rewardWords({ amount: 3, material: 'cloth' })).toBe('3 cloth');
  });

  it('says who a hero is at the level it ends with, its XP, and that the XP gave a level', () => {
    expect(heroGainWords({ hero: wat, xp: 15, level: 2, died: false })).toBe('Wat, fighter, level 2: +15 XP, level up');
  });

  it('says nothing of a level where the XP gave none', () => {
    expect(heroGainWords({ hero: wat, xp: 8, level: 1, died: false })).toBe('Wat, fighter, level 1: +8 XP');
  });

  it('says a hero who died died, and nothing of XP', () => {
    expect(heroGainWords({ hero: wat, xp: 0, level: 1, died: true })).toBe('Wat, fighter, level 1: died');
  });
});
