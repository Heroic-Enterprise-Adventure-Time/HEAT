import { JOBS } from '@heat/engine';

import { credits, creditWords, jobAt, jobsAt, retreatWords, stageWords, yieldWords } from './job-words';

const sticks = JOBS['pick-up-sticks'];
const wolves = JOBS['wolves-on-the-mill-road'];
const timber = JOBS['timber-from-the-near-woods'];
const ore = JOBS['ore-from-the-hill'];

describe('job words', () => {
  it("lists a poster's jobs and finds one only where it is posted", () => {
    expect(jobsAt('millbrook', 'job-board').map((j) => j.id)).toEqual(['pick-up-sticks', 'timber-from-the-near-woods', 'wolves-on-the-mill-road']);
    expect(jobsAt('millbrook', 'mine').map((j) => j.id)).toEqual(['ore-from-the-hill']);
    expect(jobAt('millbrook', 'job-board', 'timber-from-the-near-woods')).toBe(timber);
    expect(jobAt('millbrook', 'job-board', 'ore-from-the-hill')).toBeUndefined();
    expect(jobAt('millbrook', 'mine', 'ore-from-the-hill')).toBe(ore);
    expect(jobAt('elsewhere', 'job-board', 'timber-from-the-near-woods')).toBeUndefined();
    expect(jobAt('millbrook', 'job-board', 'nothing')).toBeUndefined();
  });

  it('says each stage in order, without its time limit', () => {
    expect(wolves.stages.map(stageWords)).toEqual(['Travel', 'Fight 2 wolves', 'Arrive']);
    expect(timber.stages.map(stageWords)).toEqual(['Travel', 'Gather timber from 3 trees, up to 60', 'Fight a wolf', 'Arrive']);
    expect(ore.stages.map(stageWords)).toEqual(['Travel', 'Gather ore from 2 ore veins, up to 40', 'Fight a wolf', 'Arrive']);
  });

  it('says what a job credits, its pay and what it can carry home, by material', () => {
    expect(credits(wolves)).toEqual([{ material: 'cloth', pay: 10, cargo: 0 }]);
    expect(credits(timber)).toEqual([
      { material: 'cloth', pay: 3, cargo: 0 },
      { material: 'timber', pay: 0, cargo: 60 },
    ]);
    expect(credits(timber).map(creditWords)).toEqual(['3 cloth', 'up to 60 timber']);
    expect(creditWords({ material: 'timber', pay: 5, cargo: 60 })).toBe('5 and up to 60 timber');
    expect(yieldWords(wolves)).toBe('10 cloth');
    expect(yieldWords(sticks)).toBe('up to 40 timber');
    expect(yieldWords(timber)).toBe('3 cloth and up to 60 timber');
    expect(yieldWords({ ...wolves, pay: [] })).toBe('nothing to bring home');
  });

  it("says a job's retreat penalty in words, naming the cargo only where there is some", () => {
    expect(retreatWords(wolves)).toBe('A retreat forfeits the pay and earns half the XP.');
    expect(retreatWords(timber)).toBe('A retreat forfeits the pay, keeps the timber gathered, and earns half the XP.');
    expect(retreatWords({ ...timber, retreat: { keepsPay: true, keepsCargo: false, xpPercent: 0 } })).toBe(
      'A retreat keeps the pay, abandons the timber gathered, and earns no XP.',
    );
  });
});
