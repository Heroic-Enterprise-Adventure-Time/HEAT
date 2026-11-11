import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { InMemoryCache } from '@apollo/client';
import { APOLLO_TESTING_CACHE, ApolloTestingController, ApolloTestingModule, type TestOperation } from 'apollo-angular/testing';
import { constantCase } from 'es-toolkit';

import { must, UNIT_PROFILES } from '@heat/engine';

import { type AdventureResultView, type AdventureView, Game, type HeroView, overrideInput, type PlayerView, type SeenHeroView } from './game';
import possibleTypes from './graphql/generated/possible-types';
import { Session, type SessionUser } from './session';

/** The cache as the application builds it: with the schema's unions and interfaces, so `... on Error` is matched (app.config.ts). */
const cache = () => ({ provide: APOLLO_TESTING_CACHE, useValue: new InMemoryCache(possibleTypes) });

/**
 * The views as the hub sends them: each object with its `__typename`, which
 * Apollo asks for and its cache keys on, and the engine's closed sets as
 * the schema's UPPER_CASE enum values, which `Game` reads back into the
 * engine's own (graphql.md, rule 4). The fakes answer in this form and the
 * tests expect the engine's.
 */
const wireHero = (hero: HeroView) => ({ __typename: 'Hero', ...hero, unitType: constantCase(hero.unitType) });
const wireSeen = (hero: SeenHeroView) => ({ __typename: 'SeenHero', ...hero, unitType: constantCase(hero.unitType) });
const wireAmounts = (typename: string, amounts: readonly { material: string; amount?: number; balance?: number; rating?: number }[]) =>
  amounts.map((a) => ({ __typename: typename, ...a, material: constantCase(a.material) }));
const wireAdventure = (a: AdventureView) => ({
  __typename: 'Adventure',
  ...a,
  job: { __typename: 'Job', ...a.job },
  snapshot: {
    __typename: 'Snapshot',
    ...a.snapshot,
    heroes: a.snapshot.heroes.map((h) => ({ __typename: 'SnapshotHero', ...h, unitType: constantCase(h.unitType), stats: { __typename: 'UnitStats', ...h.stats, gather: wireAmounts('GatherRating', h.stats.gather) } })),
  },
});
const wirePlayer = (p: PlayerView) => ({
  __typename: 'Player',
  ...p,
  camps: p.camps.map((c) => ({
    __typename: 'Camp',
    ...c,
    holdings: wireAmounts('Holding', c.holdings),
    facilities: c.facilities.map((f) => ({ __typename: 'FacilityLevel', ...f, kind: constantCase(f.kind) })),
  })),
  heroes: p.heroes.map(wireHero),
  openAdventure: p.openAdventure && wireAdventure(p.openAdventure),
});
const wireResult = (r: AdventureResultView) => ({
  __typename: 'AdventureResult',
  ...r,
  outcome: constantCase(r.outcome),
  stages: r.stages.map((s) => ({ __typename: 'StageResult', ...s, kind: constantCase(s.kind), ended: constantCase(s.ended) })),
  rewards: wireAmounts('Reward', r.rewards),
  credited: wireAmounts('Reward', r.credited),
  lost: wireAmounts('Reward', r.lost),
});

const villager: HeroView = {
  id: '6f1c2b52-8f8a-4d55-9a5e-2d3f4a1b0c9d',
  name: 'Wren',
  unitType: 'villager',
  spriteSet: 'villager-01',
  location: 'millbrook',
  recruitedAt: '2026-10-20T07:00:00.000Z',
  level: 1,
  xp: 0,
  status: 'ALIVE',
  retiredAt: null,
};

function playerWith(
  heroes: HeroView[],
  activeHeroes = heroes.length,
  livingHeroes = heroes.length,
  holdings: readonly { readonly material: string; readonly balance: number }[] = [],
): PlayerView {
  return {
    id: 'p1',
    camps: [{ location: 'millbrook', name: 'Millbrook', hallLevel: 1, heroCapacity: 4, activeHeroes, livingHeroes, holdings, resourceCapacity: 100, warehouseLevel: 1, facilities: [{ kind: 'heroes-hall', level: 1 }] }],
    heroes,
    openAdventure: null,
  };
}

const moss: SeenHeroView = { id: 's1', name: 'Moss', unitType: 'villager', spriteSet: 'villager-07', level: 2 };

/** One operation the client sent: its name, its variables and the deploy it was routed to. */
interface Call {
  readonly op: string;
  readonly variables: Record<string, unknown>;
  readonly route: string;
}

/** What the fake hub answers an operation with: the operation's data. */
type Answer = (call: Call) => Record<string, unknown>;

/**
 * A hub that answers each operation from the player held here, in the hub's
 * shape (one input object in, a result union out, each object with its
 * typename), and records what it was asked.
 */
function fakeHub(start: PlayerView) {
  let player = start;
  const calls: Call[] = [];
  const answer: Answer = ({ op, variables }) => {
    if (op === 'JoinGame') return { joinGame: { __typename: 'JoinGameSuccess', player: { __typename: 'Player', id: player.id } } };
    if (op === 'HeroesSeenAt') return { heroesSeenAt: variables['location'] === 'millbrook' ? [wireSeen(moss)] : [] };
    if (op === 'RecruitHero') {
      const { unitType, requestId } = variables['input'] as { unitType: string; requestId: string };
      // The hub's price, on the fake's holdings: a villager is free with no hero alive, 20 timber otherwise.
      const camp = must(player.camps[0], 'the camp');
      const timber = camp.holdings.find((h) => h.material === 'timber')?.balance ?? 0;
      const price = camp.livingHeroes > 0 ? 20 : 0;
      if (timber < price) return { recruitHero: { __typename: 'InsufficientResources', message: 'a villager costs 20 timber, and the camp has 0' } };
      const hero = { ...villager, id: requestId, unitType: unitType.toLowerCase() };
      const holdings = price > 0 ? [{ material: 'timber', balance: timber - price }] : camp.holdings;
      player = playerWith([...player.heroes, hero], camp.activeHeroes + 1, camp.livingHeroes + 1, holdings);
      return { recruitHero: { __typename: 'RecruitHeroSuccess', hero: wireHero(hero) } };
    }
    if (op === 'RetireHero') {
      const { heroId } = variables['input'] as { heroId: string };
      const found = must(player.heroes.find((h) => h.id === heroId), `hero ${heroId}`);
      if (player.openAdventure?.snapshot.heroes.some((h) => h.heroId === heroId)) {
        return { retireHero: { __typename: 'HeroAdventuring', message: `${found.name} is away on an adventure`, heroId } };
      }
      const hero = { ...found, status: 'RETIRED' as const, retiredAt: '2026-10-21T12:00:00.000Z' };
      player = playerWith(player.heroes.map((h) => (h.id === hero.id ? hero : h)), 0, 0);
      return { retireHero: { __typename: 'RetireHeroSuccess', hero: wireHero(hero) } };
    }
    if (op === 'StartAdventure') {
      if (player.openAdventure) return { startAdventure: { __typename: 'AdventureOpen', message: 'an adventure is already open', adventureId: player.openAdventure.id } };
      const { requestId, location, jobId, heroIds } = variables['input'] as { requestId: string; location: string; jobId: string; heroIds: string[] };
      const heroes = player.heroes.filter((h) => heroIds.includes(h.id));
      const adventure: AdventureView = {
        id: requestId,
        startedAt: '2026-10-22T07:00:00.000Z',
        location,
        seed: 's1',
        version: 'v1',
        job: { id: jobId, name: 'Wolves on the mill road', description: 'Two wolves.' },
        snapshot: {
          version: 'v1',
          jobId,
          heroes: heroes.map((h) => ({ heroId: h.id, name: h.name, unitType: h.unitType, spriteSet: h.spriteSet, level: h.level, stats: must(UNIT_PROFILES.villager, 'the villager profile').stats })),
        },
      };
      player = { ...player, openAdventure: adventure };
      return { startAdventure: { __typename: 'StartAdventureSuccess', adventure: wireAdventure(adventure) } };
    }
    if (op === 'Me') return { me: wirePlayer(player) };
    throw new Error(`the fake hub does not answer ${op}`);
  };
  return { calls, answer };
}

/** An operation the client sent, as the fake reads it. */
function callOf(operation: TestOperation): Call {
  const route = operation.operation.getContext()['route'] as string | undefined;
  return { op: operation.operation.operationName ?? '', variables: operation.operation.variables, route: route ?? 'current' };
}

/**
 * The test's hub, running: every operation the client sends is recorded and
 * answered on a later tick, as the hub's would be, until `work` settles.
 * The effects that start the reads run on the tick.
 */
async function serve<T>(controller: ApolloTestingController, hub: { calls: Call[]; answer: Answer }, work: Promise<T> | (() => boolean)): Promise<T | undefined> {
  let done = false;
  let result: T | undefined;
  const settled = typeof work === 'function' ? Promise.resolve(undefined) : work.then((value) => (result = value));
  // Its rejection is what the caller awaits below; here it only marks the work settled.
  settled.then(
    () => (done = true),
    () => (done = true),
  );
  for (let i = 0; i < 100; i++) {
    TestBed.tick();
    if (typeof work === 'function' ? work() : done) {
      await settled;
      return result;
    }
    for (const operation of controller.match(() => true)) {
      const call = callOf(operation);
      hub.calls.push(call);
      operation.flush({ data: hub.answer(call) });
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('the work did not settle');
}

function setup(start: PlayerView, user: SessionUser | null = { email: 'a@example.com', name: null, accessToken: 't' }) {
  const hub = fakeHub(start);
  TestBed.configureTestingModule({
    imports: [ApolloTestingModule],
    providers: [cache(), { provide: Session, useValue: { user: signal(user) } }],
  });
  const controller = TestBed.inject(ApolloTestingController);
  const game = TestBed.inject(Game);
  /** Serves the hub until the player is loaded, or until `work` settles, answering what the client asked meanwhile. */
  const run = <T>(work?: Promise<T> | (() => boolean)) => serve(controller, hub, work ?? (() => game.player() !== null));
  const reads = () => hub.calls.filter((c) => c.op === 'Me').length;
  return { hub, controller, game, run, reads };
}

describe('Game', () => {
  it('joins and then loads the player after sign-in', async () => {
    const { hub, game, run } = setup(playerWith([]));
    await run();
    expect(hub.calls.filter((c) => c.op !== 'HeroesSeenAt').map((c) => c.op)).toEqual(['JoinGame', 'Me']);
    expect(game.camp()?.name).toBe('Millbrook');
    expect(game.loading()).toBe(false);
    expect(game.error()).toBeNull();
  });

  it("reads the schema's enum values back as the engine's own, so nothing past the service sees HEROES_HALL or TIMBER", async () => {
    const { game, run } = setup(playerWith([villager], 1, 1, [{ material: 'timber', balance: 40 }]));
    await run();
    expect(game.camp()?.facilities).toMatchObject([{ kind: 'heroes-hall', level: 1 }]);
    expect(game.camp()?.holdings).toMatchObject([{ material: 'timber', balance: 40 }]);
    expect(game.heroesHere().map((h) => h.unitType)).toEqual(['villager']);
    await run(() => game.seenHere().length > 0);
    expect(game.seenHere()).toMatchObject([moss]);
  });

  it("passes a value its engine does not know through in the engine's spelling, so a newer hub does not stop the load", async () => {
    const { game, run } = setup(playerWith([{ ...villager, unitType: 'DRAGON_RIDER' }], 1, 1, [{ material: 'GOLD', balance: 1 }]));
    await run();
    expect(game.heroesHere().map((h) => h.unitType)).toEqual(['dragon-rider']);
    expect(game.camp()?.holdings).toMatchObject([{ material: 'gold', balance: 1 }]);
  });

  it("reads the heroes seen at the camp's location after sign-in and again when the camp changes, not after a recruit", async () => {
    const { hub, game, run } = setup(playerWith([]));
    await run(() => game.seenHere().length > 0);
    await run(game.recruit('villager'));
    const seen = () => hub.calls.filter((c) => c.op === 'HeroesSeenAt').map((c) => c.variables['location']);
    expect(seen()).toEqual(['millbrook']);

    game.location.set('elsewhere');
    TestBed.tick();
    expect(game.seenHere()).toEqual([]);
    await run(() => seen().length === 2);
    expect(seen()).toEqual(['millbrook', 'elsewhere']);
    expect(game.seenHere()).toEqual([]);
  });

  it('loads nothing while nobody is signed in', () => {
    const { controller, hub, game } = setup(playerWith([]), null);
    TestBed.tick();
    controller.verify();
    expect(hub.calls).toEqual([]);
    expect(game.player()).toBeNull();
  });

  it('offers the free villager to an empty camp, recruits it with a fresh request id, and then prices the next', async () => {
    const { hub, game, run } = setup(playerWith([]));
    await run();
    expect(game.recruits()).toEqual([
      { unitType: 'villager', cost: [], reason: null },
      { unitType: 'fighter', cost: [{ material: 'ore', amount: 40, balance: 0 }], reason: 'Not enough ore.' },
    ]);

    const hero = must(await run(game.recruit('villager')), 'the hero');
    const recruit = hub.calls.find((c) => c.op === 'RecruitHero');
    const sent = recruit?.variables['input'] as { unitType: string; requestId: string };
    expect(sent.unitType).toBe('VILLAGER');
    expect(sent.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(hero.id).toBe(sent.requestId);
    expect(hero.unitType).toBe('villager');
    expect(game.heroesHere().map((h) => h.id)).toEqual([hero.id]);
    expect(game.recruits()[0]).toEqual({ unitType: 'villager', cost: [{ material: 'timber', amount: 20, balance: 0 }], reason: 'Not enough timber.' });
  });

  it('recruits a paid villager from the timber the camp holds', async () => {
    const { game, run } = setup(playerWith([villager], 1, 1, [{ material: 'timber', balance: 40 }]));
    await run();
    expect(game.recruits()[0]).toEqual({ unitType: 'villager', cost: [{ material: 'timber', amount: 20, balance: 40 }], reason: null });
    await run(game.recruit('villager'));
    expect(game.heroesHere()).toHaveLength(2);
    expect(game.recruits()[0]?.cost).toEqual([{ material: 'timber', amount: 20, balance: 20 }]);
  });

  it('says the hall is full when every slot holds a dead hero, before what it costs', async () => {
    const { game, run } = setup(playerWith([], 4, 0));
    await run();
    expect(game.recruits().map((r) => r.reason)).toEqual(['The hall is full.', 'The hall is full.']);
  });

  it('retires a hero, which moves it to the retired and makes the villager free again', async () => {
    const { hub, game, run } = setup(playerWith([villager]));
    await run();
    const hero = await run(game.retire(villager.id));
    expect(hub.calls.find((c) => c.op === 'RetireHero')?.variables).toEqual({ input: { heroId: villager.id } });
    expect(hero?.status).toBe('RETIRED');
    expect(game.heroesHere()).toEqual([]);
    expect(game.retiredHere().map((h) => h.id)).toEqual([villager.id]);
    expect(game.recruits()[0]).toEqual({ unitType: 'villager', cost: [], reason: null });
  });

  it("throws the hub's refusal of a recruit, named by its type, for the hall to show in place, and reads the camp again", async () => {
    const { game, run, reads } = setup(playerWith([villager]));
    await run();
    const before = reads();
    await expect(run(game.recruit('villager'))).rejects.toMatchObject({ kind: 'InsufficientResources', message: 'a villager costs 20 timber, and the camp has 0' });
    expect(reads()).toBe(before + 1);
    expect(game.error()).toBeNull();
  });

  it('starts a job with a party, and then knows the open adventure', async () => {
    const { hub, game, run } = setup(playerWith([villager]));
    await run();
    expect(game.livingHere().map((h) => h.id)).toEqual([villager.id]);

    const adventure = must(await run(game.startAdventure('millbrook', 'wolves-on-the-mill-road', [villager.id])), 'the adventure');
    const sent = hub.calls.find((c) => c.op === 'StartAdventure')?.variables['input'] as { requestId: string };
    expect(sent).toEqual({ requestId: expect.any(String) as string, location: 'millbrook', jobId: 'wolves-on-the-mill-road', heroIds: [villager.id] });
    // The client names the request, and the hub makes it the adventure's id.
    expect(sent.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(adventure.id).toBe(sent.requestId);
    expect(adventure.snapshot.heroes.map((h) => h.name)).toEqual(['Wren']);
    expect(game.adventure()?.job.name).toBe('Wolves on the mill road');
  });

  it("throws a start's refusal, named by its type, and reads the player again", async () => {
    const { game, run, reads } = setup(playerWith([villager]));
    await run();
    await run(game.startAdventure('millbrook', 'wolves-on-the-mill-road', [villager.id]));
    const before = reads();

    await expect(run(game.startAdventure('millbrook', 'wolves-on-the-mill-road', [villager.id]))).rejects.toMatchObject({ kind: 'AdventureOpen' });
    expect(reads()).toBe(before + 1);
    expect(game.error()).toBeNull();
  });

  it("throws a retirement's refusal, named by its type, for the card to show in place", async () => {
    const { game, run } = setup(playerWith([villager]));
    await run();
    await run(game.startAdventure('millbrook', 'wolves-on-the-mill-road', [villager.id]));
    await expect(run(game.retire(villager.id))).rejects.toMatchObject({ kind: 'HeroAdventuring', message: 'Wren is away on an adventure' });
    expect(game.heroesHere().map((h) => h.status)).toEqual(['ALIVE']);
  });

  it('says why the player could not be read when the join fails, and loads nothing', async () => {
    const { controller, game } = setup(playerWith([]));
    TestBed.tick();
    await vi.waitFor(() => { controller.expectOne('JoinGame').networkError(new Error('the hub answered 502')); });
    await vi.waitFor(() => { expect(game.error()).toBe('the hub answered 502'); });
    expect(game.player()).toBeNull();
    expect(game.loading()).toBe(false);
    // The passers-by are read beside the join, and nothing else: no Me after a failed join.
    expect(controller.match(() => true).map((op) => op.operation.operationName)).toEqual(['HeroesSeenAt']);
    controller.verify();
  });
});

const open: AdventureView = {
  id: 'a1',
  startedAt: '2026-10-22T07:00:00.000Z',
  location: 'millbrook',
  seed: 's1',
  version: 'v1',
  job: { id: 'wolves-on-the-mill-road', name: 'Wolves on the mill road', description: 'Two wolves.' },
  snapshot: { version: 'v1', jobId: 'wolves-on-the-mill-road', heroes: [] },
};

const settledResult: AdventureResultView = {
  outcome: 'complete',
  stages: [{ stage: 0, kind: 'travel', ended: 'done' }],
  rewards: [{ material: 'cloth', amount: 10 }],
  credited: [{ material: 'cloth', amount: 10 }],
  lost: [],
  heroes: [{ heroId: 'h1', xpGained: 20, xp: 20, level: 2, dead: false }],
};

/**
 * A hub whose submit answers by route, each answer a result or the hub's
 * refusal by its type name, recording each operation and its route.
 */
function submitHub(answers: Partial<Record<string, AdventureResultView | string>>) {
  const calls: Call[] = [];
  const answer: Answer = ({ op, variables, route }) => {
    if (op === 'SubmitAdventure') {
      const found = answers[route];
      if (typeof found === 'string') return { submitAdventure: { __typename: found, message: 'refused' } };
      return { submitAdventure: { __typename: 'SubmitAdventureSuccess', adventure: { __typename: 'Adventure', id: 'a1', result: found ? wireResult(found) : null } } };
    }
    if (op === 'DiscardAdventure') {
      return { discardAdventure: { __typename: 'DiscardAdventureSuccess', adventure: { __typename: 'Adventure', id: (variables['input'] as { adventureId: string }).adventureId } } };
    }
    return { me: wirePlayer(playerWith([])) };
  };
  return { calls, answer };
}

function setupSubmit(answers: Partial<Record<string, AdventureResultView | string>>) {
  const hub = submitHub(answers);
  TestBed.configureTestingModule({
    imports: [ApolloTestingModule],
    providers: [cache(), { provide: Session, useValue: { user: signal(null) } }],
  });
  const controller = TestBed.inject(ApolloTestingController);
  const game = TestBed.inject(Game);
  return { hub, game, run: <T>(work: Promise<T>) => serve(controller, hub, work) };
}

describe('Game, submitting an adventure', () => {
  const log = [
    { kind: 'unit' as const, acceptedAtSimTime: 6829, unitId: 'h1', override: { kind: 'force-action' as const, abilityId: 'chop' } },
    { kind: 'party' as const, acceptedAtSimTime: 20_000, order: 'retreat' as const },
  ];

  it("sends the engine's log as the hub's flat entries and keeps the result to show, then reads the player again", async () => {
    const { hub, game, run } = setupSubmit({ current: settledResult });
    await run(game.submitAdventure(open, log));
    expect(hub.calls.map((c) => [c.op, c.route])).toEqual([
      ['SubmitAdventure', 'current'],
      ['Me', 'current'],
    ]);
    expect(hub.calls[0]?.variables).toEqual({
      input: {
        adventureId: 'a1',
        overrides: [
          { kind: 'UNIT', acceptedAtSimTime: 6829, unitId: 'h1', abilityId: 'chop' },
          { kind: 'PARTY', acceptedAtSimTime: 20_000, order: 'RETREAT' },
        ],
      },
    });
    expect(game.settled()).toMatchObject({ adventure: open, result: settledResult });
  });

  it('goes to the previous deploy when the current one says the engine was updated', async () => {
    const { hub, game, run } = setupSubmit({ current: 'EngineUpdated', previous: settledResult });
    await run(game.submitAdventure(open, log));
    expect(hub.calls.map((c) => [c.op, c.route])).toEqual([
      ['SubmitAdventure', 'current'],
      ['SubmitAdventure', 'previous'],
      ['Me', 'current'],
    ]);
    expect(game.settled()?.result).toMatchObject(settledResult);
  });

  it('discards the adventure when the previous deploy says so too, and keeps no result', async () => {
    const { hub, game, run } = setupSubmit({ current: 'EngineUpdated', previous: 'EngineUpdated' });
    await run(game.submitAdventure(open, log));
    expect(hub.calls.map((c) => [c.op, c.route])).toEqual([
      ['SubmitAdventure', 'current'],
      ['SubmitAdventure', 'previous'],
      ['DiscardAdventure', 'current'],
      ['Me', 'current'],
    ]);
    expect(game.settled()).toEqual({ adventure: open, result: null });
  });

  it('settles an adventure the hub says was discarded already with no result, and reads the player again', async () => {
    const { hub, game, run } = setupSubmit({ current: 'AdventureDiscarded' });
    await run(game.submitAdventure(open, log));
    expect(hub.calls.map((c) => [c.op, c.route])).toEqual([
      ['SubmitAdventure', 'current'],
      ['Me', 'current'],
    ]);
    expect(game.settled()).toEqual({ adventure: open, result: null });
  });

  it('throws any other refusal and keeps nothing, so the run can be sent again, and reads the player again', async () => {
    const { hub, game, run } = setupSubmit({ current: 'Conflict' });
    await expect(run(game.submitAdventure(open, log))).rejects.toMatchObject({ kind: 'Conflict' });
    expect(hub.calls.map((c) => [c.op, c.route])).toEqual([
      ['SubmitAdventure', 'current'],
      ['Me', 'current'],
    ]);
    expect(game.settled()).toBeNull();
  });

  it('turns a press on into the PRESS_ON order', () => {
    expect(overrideInput({ kind: 'party', acceptedAtSimTime: 5, order: 'press-on' })).toEqual({ kind: 'PARTY', acceptedAtSimTime: 5, order: 'PRESS_ON' });
  });
});
