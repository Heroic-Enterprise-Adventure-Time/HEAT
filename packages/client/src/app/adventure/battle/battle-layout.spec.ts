import { STAGE_HEIGHT, STAGE_WIDTH, battleView, entryOffset, spot, spots, stackedBattleHeight } from './battle-layout';
import { must } from '@heat/engine';

describe('Battle layout', () => {
  it('puts the party left of the middle and the other side right of it, each line further out', () => {
    const party = (['front', 'near', 'far', 'back'] as const).map((line) => spot('party', line, 0, 1).x);
    const opponents = (['front', 'near', 'far', 'back'] as const).map((line) => spot('opponents', line, 0, 1).x);
    expect(party).toEqual([...party].sort((a, b) => b - a));
    expect(opponents).toEqual([...opponents].sort((a, b) => a - b));
    expect(party[0]).toBeLessThan(STAGE_WIDTH / 2);
    expect(opponents[0]).toBeGreaterThan(STAGE_WIDTH / 2);
    expect(STAGE_WIDTH / 2 - must(party[0], 'the front line')).toBe(must(opponents[0], 'the front line') - STAGE_WIDTH / 2);
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
    const spotOf = (id: string) => must(at.get(id), `the spot of ${id}`);
    expect(spotOf('a').x).toBeLessThan(spotOf('b').x);
    expect(spotOf('a').y).toBeLessThan(spotOf('b').y);
    expect(spotOf('a').x + spotOf('b').x).toBe(2 * spot('party', 'near', 0, 1).x);
    expect(spotOf('c').y).toBe(spot('party', 'front', 0, 1).y);
    expect(spots([...units].reverse())).toEqual(at);
  });

  it("starts the other side beyond the stage's right edge", () => {
    expect(entryOffset([178, 212])).toBe(STAGE_WIDTH + 24 - 178);
    expect(entryOffset([])).toBe(0);
  });

  it('scales the stage by the largest whole number that fits and shows at least 400 pixels of road, with ground around it', () => {
    expect(battleView(1600, 900)).toEqual({ scale: 4, width: 400, height: 225, stageX: 40, stageY: 22 });
    expect(battleView(1500, 1000)).toMatchObject({ scale: 3, width: 500, height: 334, stageX: 90, stageY: 77 });
    expect(battleView(1280, 360)).toMatchObject({ scale: 2 });
    expect(battleView(200, 100).scale).toBe(1);
  });

  it('gives the stacked stage the scale the page width allows, no more than half the window high', () => {
    expect(stackedBattleHeight(400, 900)).toBe(STAGE_HEIGHT);
    expect(stackedBattleHeight(700, 900)).toBe(STAGE_HEIGHT);
    expect(stackedBattleHeight(900, 900)).toBe(STAGE_HEIGHT * 2);
    expect(stackedBattleHeight(1400, 700)).toBe(STAGE_HEIGHT);
    expect(stackedBattleHeight(400, 900, 2)).toBe(STAGE_HEIGHT);
  });
});
