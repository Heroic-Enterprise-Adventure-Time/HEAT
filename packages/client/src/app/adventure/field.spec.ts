import { CART, CART_UNIT_ID, must } from '@heat/engine';

import { caravanTimeline, fighterOn, jobsThatDeliver, jobsThatDeliverNothing, SPEC_CARAVAN } from '../testing/caravan';
import { applyEvent, emptyField, type Field, jobCart, secondsLeft, timelineCart, waitingWords } from './field';

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

describe("a caravan's cart", () => {
  /** The field after each event of a timeline, from the field it sets out with. */
  const fields = (timeline: ReturnType<typeof caravanTimeline>) => {
    let field = emptyField(fighterOn(SPEC_CARAVAN.id).heroes, timelineCart(timeline.events));
    return [field, ...timeline.events.map((event) => (field = applyEvent(field, event)))];
  };

  it('sets out beside the party at its full health, on its home line, and is not among the heroes', () => {
    const [start] = fields(caravanTimeline());
    expect(start?.cart).toEqual({ unitId: CART_UNIT_ID, side: 'party', kind: 'cart', type: 'cart', name: CART.name, line: CART.homeLine, health: CART.health, maxHealth: CART.health });
    expect(start?.party.map((u) => u.kind)).toEqual(['hero']);
  });

  it('takes the blows the events say, and keeps its health from one stage to the next', () => {
    const timeline = caravanTimeline();
    const hits = timeline.events.flatMap((e) => (e.kind === 'action-resolved' ? e.effects : [])).filter((f) => f.kind === 'damage' && f.targetId === CART_UNIT_ID);
    expect(hits.length).toBeGreaterThan(0);
    const lastHit = hits.at(-1);
    const last = must(fields(timeline).at(-1), 'the last field');
    expect(last.cart?.health).toBe(lastHit?.kind === 'damage' ? lastHit.newHealth : undefined);
  });

  it('lies broken where it fell until the next stage begins, and is gone from then on', () => {
    const timeline = caravanTimeline(1);
    const all = fields(timeline);
    const down = timeline.events.findIndex((e) => e.kind === 'unit-down' && e.unitId === CART_UNIT_ID);
    expect(down).toBeGreaterThan(-1);
    expect(all[down + 1]?.cart?.health).toBe(0);
    const next = timeline.events.findIndex((e, i) => i > down && e.kind === 'stage-start');
    expect(all[next]?.cart?.health).toBe(0);
    for (const field of all.slice(next + 1)) expect(field.cart).toBeNull();
  });

  it('is read from a stored timeline as it stood in its first battle, and is not on one that had none', () => {
    expect(timelineCart(caravanTimeline().events)).toEqual({ health: CART.health, maxHealth: CART.health });
    expect(timelineCart([])).toBeNull();
  });

  it('is on every job of the content that delivers, at the content's health', () => {
    const jobIds = jobsThatDeliver();
    expect(jobIds.length).toBeGreaterThan(0);
    for (const jobId of jobIds) expect(jobCart(jobId), jobId).toEqual({ health: CART.health, maxHealth: CART.health });
  });

  it('is not on a job that delivers nothing, or one this build does not have', () => {
    const jobIds = jobsThatDeliverNothing();
    expect(jobIds.length).toBeGreaterThan(0);
    for (const jobId of jobIds) expect(jobCart(jobId), jobId).toBeNull();
    expect(jobCart('a-job-of-a-later-version')).toBeNull();
    expect(emptyField([]).cart).toBeNull();
  });
});
