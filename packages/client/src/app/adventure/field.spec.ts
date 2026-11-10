import { emptyField, type Field, secondsLeft, waitingWords } from './field';

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
