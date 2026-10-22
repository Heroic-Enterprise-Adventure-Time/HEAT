import { JOBS } from '@heat/engine';
import { creditWords, credits, jobAt, jobsAt, payWords, retreatWords, stageWords } from './job-words';

const wolves = JOBS['wolves-on-the-mill-road'];
const timber = JOBS['timber-from-the-near-woods'];

describe('job words', () => {
  it("lists a location's jobs and finds one only on its own board", () => {
    expect(jobsAt('millbrook').map((j) => j.id)).toEqual(['wolves-on-the-mill-road', 'timber-from-the-near-woods']);
    expect(jobAt('millbrook', 'timber-from-the-near-woods')).toBe(timber);
    expect(jobAt('elsewhere', 'timber-from-the-near-woods')).toBeUndefined();
    expect(jobAt('millbrook', 'nothing')).toBeUndefined();
  });

  it('says each stage in order, without its time limit', () => {
    expect(wolves.stages.map(stageWords)).toEqual(['Travel', 'Fight 2 wolves', 'Arrive']);
    expect(timber.stages.map(stageWords)).toEqual(['Travel', 'Gather timber from 3 trees, up to 60', 'Fight a wolf', 'Arrive']);
  });

  it('says what a job credits, its pay and what it can carry home, by material', () => {
    expect(credits(wolves)).toEqual([{ material: 'cloth', pay: 10, cargo: 0 }]);
    expect(credits(timber)).toEqual([
      { material: 'cloth', pay: 3, cargo: 0 },
      { material: 'timber', pay: 0, cargo: 60 },
    ]);
    expect(credits(timber).map(creditWords)).toEqual(['3 cloth', 'up to 60 timber']);
    expect(creditWords({ material: 'timber', pay: 5, cargo: 60 })).toBe('5 and up to 60 timber');
    expect(payWords(wolves)).toBe('pays 10 cloth');
  });

  it("says a job's retreat penalty in words, naming the cargo only where there is some", () => {
    expect(retreatWords(wolves)).toBe('A retreat forfeits the pay and earns half the XP.');
    expect(retreatWords(timber)).toBe('A retreat forfeits the pay, keeps the timber gathered, and earns half the XP.');
    expect(retreatWords({ ...timber, retreat: { keepsPay: true, keepsCargo: false, xpPercent: 0 } })).toBe(
      'A retreat keeps the pay, abandons the timber gathered, and earns no XP.',
    );
  });
});
