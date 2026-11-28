import { BAR_WIDTH, barFill } from './health-bar';

describe('barFill', () => {
  it('fills the whole bar at full health and a share of it below, in whole pixels', () => {
    expect(barFill(40, 40).width).toBe(BAR_WIDTH);
    expect(barFill(20, 40).width).toBe(BAR_WIDTH / 2);
    expect(barFill(30, 40).width).toBe(Math.round(BAR_WIDTH * 0.75));
  });

  it('keeps one pixel while there is any health to show', () => {
    expect(barFill(1, 1000).width).toBe(1);
  });

  it('is high above half, middling above a quarter, and low at a quarter or under', () => {
    expect(barFill(40, 40).level).toBe('high');
    expect(barFill(21, 40).level).toBe('high');
    expect(barFill(20, 40).level).toBe('middle');
    expect(barFill(11, 40).level).toBe('middle');
    expect(barFill(10, 40).level).toBe('low');
    expect(barFill(1, 40).level).toBe('low');
  });
});
