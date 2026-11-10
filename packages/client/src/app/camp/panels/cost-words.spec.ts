import { costWords, priceWords } from './cost-words';

describe('costWords', () => {
  it('says each resource of a cost beside the balance, one after another', () => {
    expect(
      costWords([
        { material: 'timber', amount: 80, balance: 0 },
        { material: 'cloth', amount: 20, balance: 5 },
      ]),
    ).toBe('80 timber, you have 0; 20 cloth, you have 5');
  });
});

describe('priceWords', () => {
  it('calls a recruit with no cost free', () => {
    expect(priceWords({ unitType: 'villager', cost: [], reason: null })).toBe('free');
  });

  it("says a paid recruit's cost beside the balance", () => {
    expect(priceWords({ unitType: 'fighter', cost: [{ material: 'ore', amount: 40, balance: 0 }], reason: 'Not enough ore.' })).toBe('40 ore, you have 0');
  });
});
