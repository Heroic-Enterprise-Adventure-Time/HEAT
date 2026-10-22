import { emptyField, secondsLeft, type Field } from './field';

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
