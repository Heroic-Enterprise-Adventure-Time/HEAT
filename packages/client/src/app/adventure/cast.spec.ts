import { range } from 'es-toolkit';

import { type AdventureSnapshot, must, replay, UNIT_PROFILES } from '@heat/engine';

import { jobCast, timelineCast } from './cast';

/** A lone fighter's snapshot for a job: it completes the first three jobs' gathers and fights it can reach, so its timeline shows who was there. */
const fighterOn = (jobId: string): AdventureSnapshot => ({
  version: 'v1',
  jobId,
  heroes: [{ heroId: 'h1', name: 'Wat', unitType: 'fighter', spriteSet: 'fighter-02', level: 1, stats: must(UNIT_PROFILES.fighter, 'the fighter profile').stats }],
});

describe('jobCast', () => {
  it("names everyone a job's stages set against the party, once each, by kind", () => {
    expect(jobCast('timber-from-the-near-woods', 'seed-1')).toEqual([
      { kind: 'resource', type: 'tree' },
      { kind: 'monster', type: 'wolf' },
    ]);
    // Two wolves are one sprite set.
    expect(jobCast('wolves-on-the-mill-road', 'seed-1')).toEqual([{ kind: 'monster', type: 'wolf' }]);
    // A gather with monsters among its veins.
    expect(jobCast('goblins-in-the-old-workings', 'seed-1')).toEqual([
      { kind: 'resource', type: 'ore-vein' },
      { kind: 'monster', type: 'goblin-rock-thrower' },
    ]);
  });

  it('is the same on every seed for a job with no variance', () => {
    for (const i of range(50)) expect(jobCast('timber-from-the-near-woods', `seed-${i}`)).toEqual(jobCast('timber-from-the-near-woods', 'seed-1'));
  });

  it("names for a job that varies who this adventure of it meets, as the run itself then does: the first job's wolf only on the seeds that roll one (Issue-341)", () => {
    const tree = { kind: 'resource', type: 'tree' };
    const wolf = { kind: 'monster', type: 'wolf' };
    const casts = range(200).map((i) => {
      const seed = `seed-${i}`;
      const cast = jobCast('pick-up-sticks', seed);
      // The run is the engine's, from the same snapshot's job and the same seed: who it met is who was loaded.
      expect(cast, seed).toEqual(timelineCast(replay(fighterOn('pick-up-sticks'), seed, []).timeline.events));
      return cast;
    });
    const withWolf = casts.filter((cast) => cast.length === 2);
    expect(withWolf.length).toBeGreaterThan(0);
    for (const cast of withWolf) expect(cast).toEqual([tree, wolf]);
    // Most runs have no wolf, and load no wolf.
    const alone = casts.filter((cast) => cast.length === 1);
    expect(alone.length).toBeGreaterThan(withWolf.length);
    for (const cast of alone) expect(cast).toEqual([tree]);
    expect(alone.length + withWolf.length).toBe(casts.length);
  });

  it('knows nobody for a job this build does not have', () => {
    expect(jobCast('a-job-of-a-later-version', 'seed-1')).toEqual([]);
    expect(jobCast('toString', 'seed-1')).toEqual([]);
  });
});

describe('timelineCast', () => {
  it('reads who was there from the battles of a stored timeline', () => {
    const { timeline } = replay(fighterOn('timber-from-the-near-woods'), 'seed-1', []);
    const cast = timelineCast(timeline.events);
    // Nobody of the party, and each kind once however many battles it was in; the wolf only if the run reached it.
    expect(cast[0]).toEqual({ kind: 'resource', type: 'tree' });
    expect(cast.filter((member) => member.kind === 'hero')).toEqual([]);
    expect(new Set(cast.map((member) => member.type)).size).toBe(cast.length);
  });

  it('knows nobody for a timeline with no battle', () => {
    expect(timelineCast([])).toEqual([]);
  });
});
