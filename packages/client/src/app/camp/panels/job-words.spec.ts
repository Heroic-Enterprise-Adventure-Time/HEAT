import { JOBS } from '@heat/engine';

import { bonusWords, bonusXpWords, jobAt, jobsAt, lockedWords, postedJob, posterOf, retreatWords } from './job-words';

const sticks = JOBS['pick-up-sticks'];
const wolves = JOBS['wolves-on-the-mill-road'];
const timber = JOBS['timber-from-the-near-woods'];
const ore = JOBS['ore-from-the-hill'];
const caravan = JOBS['caravan-to-highcrag'];
const seam = JOBS['the-deep-seam'];
const stand = JOBS['the-old-growth-stand'];

describe('job words', () => {
  it("lists a poster's jobs and finds one only where it is posted", () => {
    expect(jobsAt('millbrook', 'job-board').map((j) => j.id)).toEqual(['pick-up-sticks', 'timber-from-the-near-woods', 'wolves-on-the-mill-road']);
    expect(jobsAt('millbrook', 'mine').map((j) => j.id)).toEqual(['ore-from-the-hill', 'goblins-in-the-old-workings', 'the-deep-seam']);
    expect(jobAt('millbrook', 'job-board', 'timber-from-the-near-woods')).toBe(timber);
    expect(jobAt('millbrook', 'job-board', 'ore-from-the-hill')).toBeUndefined();
    expect(jobAt('millbrook', 'mine', 'ore-from-the-hill')).toBe(ore);
    expect(jobAt('elsewhere', 'job-board', 'timber-from-the-near-woods')).toBeUndefined();
    expect(jobAt('millbrook', 'job-board', 'nothing')).toBeUndefined();
  });

  it("reads a job's poster from its address: the job board where it names no facility, and none for a facility there is not", () => {
    expect(posterOf(undefined)).toBe('job-board');
    expect(posterOf('mine')).toBe('mine');
    expect(posterOf('forge')).toBeNull();
    expect(posterOf('toString')).toBeNull();
  });

  it('finds a job under its poster only once the poster is built, the job board always', () => {
    expect(postedJob('millbrook', 'job-board', 0, 'pick-up-sticks')).toBe(sticks);
    expect(postedJob('millbrook', 'mine', 0, 'ore-from-the-hill')).toBeUndefined();
    expect(postedJob('millbrook', 'mine', 1, 'ore-from-the-hill')).toBe(ore);
    expect(postedJob('millbrook', null, 1, 'ore-from-the-hill')).toBeUndefined();
    expect(postedJob('millbrook', 'mine', 1, null)).toBeUndefined();
  });

  it("lists the caravan hub's caravan beside its road job, now that its page picks a cargo and who stays (Issue-355)", () => {
    expect(jobsAt('millbrook', 'caravan-hub').map((j) => j.id)).toEqual(['scout-the-road-to-highcrag', 'caravan-to-highcrag']);
    expect(jobAt('millbrook', 'caravan-hub', 'caravan-to-highcrag')).toBe(caravan);
  });

  it('says what a caravan to a location the player has no camp at needs, by the unlock and not by what grants it, and nothing otherwise', () => {
    const hub = [{ kind: 'caravan-hub' as const, level: 1 }];
    expect(lockedWords(caravan, ['millbrook'], hub)).toBe('Needs the road to Highcrag.');
    expect(lockedWords(caravan, ['millbrook', 'highcrag'], hub)).toBeNull();
    expect(lockedWords(caravan, null, hub)).toBeNull();
    expect(lockedWords(wolves, ['millbrook'], [])).toBeNull();
  });

  it('says what a job of a level the camp has not built needs, as the hub refuses it (Issue-357), and nothing once it is built', () => {
    expect(lockedWords(seam, ['millbrook'], [{ kind: 'mine', level: 1 }])).toBe('Needs a level 2 mine.');
    expect(lockedWords(stand, ['millbrook'], [{ kind: 'lumber-camp', level: 1 }])).toBe('Needs a level 2 lumber camp.');
    expect(lockedWords(seam, null, [{ kind: 'mine', level: 1 }])).toBe('Needs a level 2 mine.');
    expect(lockedWords(seam, ['millbrook'], [{ kind: 'mine', level: 2 }])).toBeNull();
    expect(lockedWords(ore, ['millbrook'], [{ kind: 'mine', level: 1 }])).toBeNull();
  });

  it("says a job's bonus XP on the board, beside its pay's chips", () => {
    expect(bonusXpWords(sticks)).toBe('2 bonus XP');
    expect(bonusXpWords(wolves)).toBe('10 bonus XP');
  });

  it("says a job's bonus as what arriving pays each hero", () => {
    expect(bonusWords(timber)).toBe('Bonus: 4 XP to each hero who arrives.');
  });

  it('says the one retreat rule, naming the pay only where the job has some', () => {
    expect(retreatWords(wolves)).toBe('A retreat keeps what dropped and the XP earned, and loses the pay and the bonus.');
    expect(retreatWords(sticks)).toBe('A retreat keeps what dropped and the XP earned, and loses the bonus.');
    expect(retreatWords(caravan)).toBe('A retreat keeps what dropped and the XP earned, and loses the bonus and the cargo.');
    expect(retreatWords({ ...caravan, pay: [{ material: 'cloth', amount: 1 }] })).toBe('A retreat keeps what dropped and the XP earned, and loses the pay, the bonus and the cargo.');
  });
});
