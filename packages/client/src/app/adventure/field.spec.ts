import { applyEvent, emptyField, type Field, secondsLeft, waitingWords } from './field';

const field = (timeLimitMs: number | null, stageStart = 4000): Field => ({
  ...emptyField([]),
  stage: 1,
  stageKind: 'fight',
  stageStart,
  timeLimitMs,
});

describe('secondsLeft', () => {
  it("counts down only in a stage's last ten seconds, in whole seconds", () => {
    expect(secondsLeft(field(60_000), 4000 + 49_999)).toBeNull();
    expect(secondsLeft(field(60_000), 4000 + 50_000)).toBe(10);
    expect(secondsLeft(field(60_000), 4000 + 50_001)).toBe(10);
    expect(secondsLeft(field(60_000), 4000 + 59_001)).toBe(1);
    expect(secondsLeft(field(60_000), 4000 + 60_000)).toBeNull();
  });

  it('says nothing outside a fight or a gather, or once the adventure has ended', () => {
    expect(secondsLeft(field(null), 4000 + 55_000)).toBeNull();
    expect(secondsLeft({ ...field(60_000), outcome: 'retreat' }, 4000 + 55_000)).toBeNull();
  });
});

describe('waitingWords', () => {
  it('says nothing while a fight or a gather is under way', () => {
    expect(waitingWords(field(60_000))).toBeNull();
    expect(waitingWords({ ...field(60_000), stageKind: 'gather' })).toBeNull();
  });

  it("says where the party is by the stage's kind, never \"On the road\" off the road", () => {
    expect(waitingWords({ ...field(null), stageKind: 'travel' })).toBe('On the road: abilities are for a fight or a gather.');
    expect(waitingWords({ ...field(null), stageKind: 'arrive' })).toBe('Nearly home: abilities are for a fight or a gather.');
    // A fight or a gather before its battle begins, or after it ends and before the stage does; and before the first stage.
    for (const stageKind of ['fight', 'gather', null]) {
      expect(waitingWords({ ...field(null), stageKind })).toBe('Abilities are for a fight or a gather while it is under way.');
    }
  });

  it('says the adventure is over once it has an outcome, whatever the stage', () => {
    expect(waitingWords({ ...field(60_000), outcome: 'defeat' })).toBe('The adventure is over.');
    expect(waitingWords({ ...field(null), stageKind: 'travel', outcome: 'retreat' })).toBe('The adventure is over.');
  });
});

describe('what the party carries', () => {
  const drop = (material: 'timber' | 'ore', amount: number) => ({ kind: 'drop', timestamp: 5000, unitId: 's1-tree-1', material, amount }) as const;

  it('counts a drop the moment it falls, each resource on its own line, in the order they first dropped (decision 0058)', () => {
    const one = applyEvent(field(60_000), drop('timber', 34));
    expect(one.drops).toEqual([{ material: 'timber', amount: 34 }]);
    const more = [drop('ore', 22), drop('timber', 31)].reduce(applyEvent, one);
    expect(more.drops).toEqual([{ material: 'timber', amount: 65 }, { material: 'ore', amount: 22 }]);
  });

  it("takes the engine's own count at a stage's end", () => {
    const carried = applyEvent(field(60_000), drop('timber', 34));
    const ended = applyEvent(carried, { kind: 'stage-end', timestamp: 9000, stage: 1, ended: 'win', health: [], drops: [{ material: 'timber', amount: 34 }] });
    expect(ended.drops).toEqual([{ material: 'timber', amount: 34 }]);
  });

  it('carries nothing once the party is all down, and keeps what it carries on a retreat or an arrival', () => {
    const carried = applyEvent(field(60_000), drop('timber', 34));
    const ended = (outcome: 'complete' | 'retreat' | 'defeat') => applyEvent(carried, { kind: 'adventure-end', timestamp: 9000, outcome }).drops;
    expect(ended('defeat')).toEqual([]);
    expect(ended('retreat')).toEqual([{ material: 'timber', amount: 34 }]);
    expect(ended('complete')).toEqual([{ material: 'timber', amount: 34 }]);
  });

  it('carries nothing before anything has dropped', () => {
    expect(emptyField([]).drops).toEqual([]);
  });
});
