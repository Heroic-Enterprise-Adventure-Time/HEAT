import { STAGE_HEIGHT, STAGE_WIDTH, battleView, entryOffset, spot, spots, stackedBattleHeight } from './battle-layout';

describe('Battle layout', () => {
  it('puts the party left of the middle and the other side right of it, each line further out', () => {
    const party = (['front', 'near', 'far', 'back'] as const).map((line) => spot('party', line, 0, 1).x);
    const opponents = (['front', 'near', 'far', 'back'] as const).map((line) => spot('opponents', line, 0, 1).x);
    expect(party).toEqual([...party].sort((a, b) => b - a));
    expect(opponents).toEqual([...opponents].sort((a, b) => a - b));
    expect(party[0]).toBeLessThan(STAGE_WIDTH / 2);
    expect(opponents[0]).toBeGreaterThan(STAGE_WIDTH / 2);
    expect(STAGE_WIDTH / 2 - party[0]!).toBe(opponents[0]! - STAGE_WIDTH / 2);
    expect(party[3]).toBeGreaterThan(0);
    expect(opponents[3]).toBeLessThan(STAGE_WIDTH);
  });

  it("spreads a line's units in depth, in the same order whatever order they come in", () => {
    const units = [
      { unitId: 'b', side: 'party' as const, line: 'near' as const },
      { unitId: 'a', side: 'party' as const, line: 'near' as const },
      { unitId: 'c', side: 'party' as const, line: 'front' as const },
    ];
    const at = spots(units);
    expect(at.get('a')!.x).toBeLessThan(at.get('b')!.x);
    expect(at.get('a')!.y).toBeLessThan(at.get('b')!.y);
    expect(at.get('a')!.x + at.get('b')!.x).toBe(2 * spot('party', 'near', 0, 1).x);
    expect(at.get('c')!.y).toBe(spot('party', 'front', 0, 1).y);
    expect(spots([...units].reverse())).toEqual(at);
  });

  it("starts the other side beyond the stage's right edge", () => {
    expect(entryOffset([178, 212])).toBe(STAGE_WIDTH + 24 - 178);
    expect(entryOffset([])).toBe(0);
  });

  it('scales the stage by the largest whole number that fits, with ground around it', () => {
    expect(battleView(1280, 720)).toEqual({ scale: 4, width: 320, height: 180, stageX: 0, stageY: 0 });
    expect(battleView(1000, 700)).toMatchObject({ scale: 3, width: 334, height: 234, stageX: 7, stageY: 27 });
    expect(battleView(200, 100).scale).toBe(1);
  });

  it('gives the stacked stage the scale the page width allows, no more than half the window high', () => {
    expect(stackedBattleHeight(400, 900)).toBe(STAGE_HEIGHT);
    expect(stackedBattleHeight(700, 900)).toBe(STAGE_HEIGHT * 2);
    expect(stackedBattleHeight(1400, 700)).toBe(STAGE_HEIGHT);
    expect(stackedBattleHeight(400, 900, 2)).toBe(STAGE_HEIGHT);
  });
});
