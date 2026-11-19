import { type AdventureSnapshot, must, replay, UNIT_PROFILES } from '@heat/engine';

import { jobCast, timelineCast } from './cast';

describe('jobCast', () => {
  it("names everyone a job's stages set against the party, once each, by kind", () => {
    expect(jobCast('timber-from-the-near-woods')).toEqual([
      { kind: 'resource', type: 'tree' },
      { kind: 'monster', type: 'wolf' },
    ]);
    // Two wolves are one sprite set.
    expect(jobCast('wolves-on-the-mill-road')).toEqual([{ kind: 'monster', type: 'wolf' }]);
    // A gather with monsters among its veins.
    expect(jobCast('goblins-in-the-old-workings')).toEqual([
      { kind: 'resource', type: 'ore-vein' },
      { kind: 'monster', type: 'goblin-rock-thrower' },
    ]);
  });

  it('knows nobody for a job this build does not have', () => {
    expect(jobCast('a-job-of-a-later-version')).toEqual([]);
    expect(jobCast('toString')).toEqual([]);
  });
});

describe('timelineCast', () => {
  it('reads who was there from the battles of a stored timeline', () => {
    const snapshot: AdventureSnapshot = {
      version: 'v1',
      jobId: 'timber-from-the-near-woods',
      heroes: [{ heroId: 'h1', name: 'Wat', unitType: 'fighter', spriteSet: 'fighter-02', level: 1, stats: must(UNIT_PROFILES.fighter, 'the fighter profile').stats }],
    };
    const { timeline } = replay(snapshot, 'seed-1', []);
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
