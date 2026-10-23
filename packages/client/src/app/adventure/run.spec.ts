import { UNIT_PROFILES, replay, type AdventureSnapshot } from '@heat/engine';
import { isEntry } from './field';
import { must } from '../must';
import { AdventureRun, SAVED_RUN_PREFIX, TimelineRun, forgetRun, loadRun, saveRun } from './run';

const villager = must(UNIT_PROFILES.villager, 'the villager profile');
const fighter = must(UNIT_PROFILES.fighter, 'the fighter profile');

export const SNAPSHOT: AdventureSnapshot = {
  version: 'v1',
  jobId: 'timber-from-the-near-woods',
  heroes: [
    { heroId: 'h1', unitType: 'fighter', name: 'Wat', spriteSet: 'fighter-02', level: 1, stats: fighter.stats },
    { heroId: 'h2', unitType: 'villager', name: 'Wren', spriteSet: 'villager-01', level: 1, stats: villager.stats },
  ],
};

/** Plays a run in 16 ms frames from where it is, with a forced chop at 6 s and a retreat ordered at 20 s, as a player would. */
function playLive(run: AdventureRun, until = Infinity): void {
  for (let t = run.simTime + 16; !run.complete && t <= until; t += 16) {
    if (t === 6000) run.force('h2', 'chop');
    if (t === 20_000) run.orderParty('retreat');
    run.advanceTo(t);
  }
}

describe('AdventureRun', () => {
  beforeEach(() => { localStorage.clear(); });

  it("keeps the log the engine keeps, so the hub's replay of it gives the same timeline and result", () => {
    const run = new AdventureRun(SNAPSHOT, 'seed-1');
    playLive(run);
    expect(run.complete).toBe(true);
    const { timeline } = replay(SNAPSHOT, 'seed-1', run.log);
    expect(run.log).toEqual(timeline.overrideLog);
    expect(run.events).toEqual(timeline.events);
    expect(run.log.some((e) => e.kind === 'unit')).toBe(true);
    expect(run.log.some((e) => e.kind === 'party')).toBe(true);
  });

  it('resumes from a saved log at the saved time and plays on to the same end', () => {
    const first = new AdventureRun(SNAPSHOT, 'seed-2');
    playLive(first, 12_000);
    const saved = { log: [...first.log], simTime: first.simTime };

    const resumed = new AdventureRun(SNAPSHOT, 'seed-2', saved);
    expect(resumed.simTime).toBe(saved.simTime);
    expect(resumed.events).toEqual(first.events);

    playLive(first);
    playLive(resumed);
    expect(resumed.complete).toBe(true);
    expect(resumed.events).toEqual(first.events);
    expect(resumed.log).toEqual(first.log);
  });

  it('starts again from the beginning with the same seed when there is no saved log', () => {
    const a = new AdventureRun(SNAPSHOT, 'seed-3');
    const b = new AdventureRun(SNAPSHOT, 'seed-3');
    a.advanceTo(15_000);
    b.advanceTo(15_000);
    expect(b.events).toEqual(a.events);
  });

  it('saves, loads and forgets a log in the browser by adventure id, and reads a damaged one as none', () => {
    expect(loadRun('a1')).toBeNull();
    saveRun('a1', { log: [{ kind: 'party', acceptedAtSimTime: 4000, order: 'retreat' }], simTime: 4100 });
    expect(loadRun('a1')).toEqual({ log: [{ kind: 'party', acceptedAtSimTime: 4000, order: 'retreat' }], simTime: 4100 });
    forgetRun('a1');
    expect(loadRun('a1')).toBeNull();
    localStorage.setItem(`${SAVED_RUN_PREFIX}a2`, '{not json');
    expect(loadRun('a2')).toBeNull();
  });

  it('stops at an entry, with the clock at its time, and goes on from there', () => {
    const run = new AdventureRun(SNAPSHOT, 'seed-4');
    expect(run.events.map((e) => e.kind)).toEqual(['adventure-start', 'stage-start']);
    const events = run.advanceTo(60_000);
    expect(events.at(-1)?.kind).toBe('battle-start');
    expect(events.some(isEntry)).toBe(true);
    expect(run.simTime).toBe(4000);
    expect(run.advanceTo(5000).some(isEntry)).toBe(false);
    expect(run.simTime).toBe(5000);
  });
});

describe('TimelineRun', () => {
  it('plays a stored timeline with no engine, stopping at the same entries, to the same events', () => {
    const { timeline } = replay(SNAPSHOT, 'seed-5', []);
    const live = new AdventureRun(SNAPSHOT, 'seed-5');
    const stored = new TimelineRun(timeline);
    expect(stored.events).toEqual(live.events);
    for (let t = 16; !stored.complete; t += 16) {
      live.advanceTo(t);
      stored.advanceTo(t);
      expect(stored.simTime).toBe(live.simTime);
    }
    expect(stored.events).toEqual(timeline.events);
  });
});
