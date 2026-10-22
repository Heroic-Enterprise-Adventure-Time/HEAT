import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Api, ApiError } from './api';
import { Game, type HeroView, type PlayerView, type SeenHeroView } from './game';
import { Session, type SessionUser } from './session';

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

function playerWith(heroes: HeroView[], activeHeroes = heroes.length, livingHeroes = heroes.length): PlayerView {
  return {
    id: 'p1',
    camps: [{ location: 'millbrook', name: 'Millbrook', hallLevel: 1, heroCapacity: 4, activeHeroes, livingHeroes, holdings: [], resourceCapacity: 100 }],
    heroes,
    openAdventure: null,
  };
}

const moss: SeenHeroView = { id: 's1', name: 'Moss', unitType: 'villager', spriteSet: 'villager-07', level: 2 };

/** An API that answers each operation from the player held here, and records what it was asked. */
function fakeApi(start: PlayerView) {
  let player = start;
  const calls: { query: string; variables: Record<string, unknown> }[] = [];
  return {
    calls,
    request: async (query: string, variables: Record<string, unknown> = {}) => {
      calls.push({ query, variables });
      if (query.includes('joinGame')) return { joinGame: { id: player.id } };
      if (query.includes('heroesSeenAt')) return { heroesSeenAt: variables['at'] === 'millbrook' ? [moss] : [] };
      if (query.includes('recruitHero')) {
        if (player.camps[0]!.livingHeroes > 0) throw new ApiError('the villager is free only when no hero at the camp is alive', 'NOT_FREE');
        const hero = { ...villager, id: variables['id'] as string };
        player = playerWith([...player.heroes, hero]);
        return { recruitHero: hero };
      }
      if (query.includes('retireHero')) {
        const hero = { ...player.heroes.find((h) => h.id === variables['id'])!, status: 'RETIRED' as const, retiredAt: '2026-10-21T12:00:00.000Z' };
        player = playerWith(player.heroes.map((h) => (h.id === hero.id ? hero : h)), 0, 0);
        return { retireHero: hero };
      }
      if (query.includes('startAdventure')) {
        if (player.openAdventure) throw new ApiError('an adventure is already open', 'ADVENTURE_OPEN');
        const heroes = player.heroes.filter((h) => (variables['heroes'] as string[]).includes(h.id));
        const adventure = {
          id: 'a1',
          startedAt: '2026-10-22T07:00:00.000Z',
          location: variables['at'] as string,
          job: { id: variables['job'] as string, name: 'Wolves on the mill road', description: 'Two wolves.' },
          snapshot: { heroes: heroes.map((h) => ({ heroId: h.id, name: h.name, unitType: h.unitType, spriteSet: h.spriteSet, level: h.level })) },
        };
        player = { ...player, openAdventure: adventure };
        return { startAdventure: adventure };
      }
      return { me: player };
    },
  };
}

function setup(start: PlayerView, user: SessionUser | null = { email: 'a@example.com', name: null, accessToken: 't' }) {
  const api = fakeApi(start);
  const session = { user: signal(user) };
  TestBed.configureTestingModule({
    providers: [
      { provide: Api, useValue: api },
      { provide: Session, useValue: session },
    ],
  });
  return { api, session, game: TestBed.inject(Game) };
}

describe('Game', () => {
  it('joins and then loads the player after sign-in', async () => {
    const { api, game } = setup(playerWith([]));
    TestBed.tick();
    await vi.waitFor(() => expect(game.player()).not.toBeNull());
    const own = api.calls.filter((c) => !c.query.includes('heroesSeenAt'));
    expect(own.map((c) => c.query.includes('joinGame'))).toEqual([true, false]);
    expect(game.camp()?.name).toBe('Millbrook');
  });

  it("reads the heroes seen at the camp's location after sign-in and again when the camp changes, not after a recruit", async () => {
    const { api, game } = setup(playerWith([]));
    TestBed.tick();
    await vi.waitFor(() => expect(game.seenHere()).toEqual([moss]));
    await game.recruitVillager();
    expect(api.calls.filter((c) => c.query.includes('heroesSeenAt')).map((c) => c.variables['at'])).toEqual(['millbrook']);

    game.location.set('elsewhere');
    TestBed.tick();
    expect(game.seenHere()).toEqual([]);
    await vi.waitFor(() => expect(api.calls.filter((c) => c.query.includes('heroesSeenAt'))).toHaveLength(2));
    expect(game.seenHere()).toEqual([]);
  });

  it('loads nothing while nobody is signed in', async () => {
    const { api, game } = setup(playerWith([]), null);
    TestBed.tick();
    expect(api.calls).toEqual([]);
    expect(game.player()).toBeNull();
  });

  it('offers the free villager to an empty camp, recruits it with a fresh request id, and then stops offering it', async () => {
    const { api, game } = setup(playerWith([]));
    TestBed.tick();
    await vi.waitFor(() => expect(game.player()).not.toBeNull());
    expect(game.freeVillager()).toEqual({ offered: true, reason: null });

    const hero = await game.recruitVillager();
    const recruit = api.calls.find((c) => c.query.includes('recruitHero'));
    expect(recruit?.variables['id']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(hero?.id).toBe(recruit?.variables['id']);
    expect(game.heroesHere().map((h) => h.id)).toEqual([hero?.id]);
    expect(game.freeVillager()).toEqual({ offered: false, reason: 'The villager is free only when no hero here is alive.' });
  });

  it('says the hall is full when every slot holds a dead hero', async () => {
    const { game } = setup(playerWith([], 4, 0));
    TestBed.tick();
    await vi.waitFor(() => expect(game.player()).not.toBeNull());
    expect(game.freeVillager()).toEqual({ offered: false, reason: 'The hall is full.' });
  });

  it('retires a hero, which moves it to the retired and offers the free villager again', async () => {
    const { api, game } = setup(playerWith([villager]));
    TestBed.tick();
    await vi.waitFor(() => expect(game.player()).not.toBeNull());
    const hero = await game.retire(villager.id);
    expect(api.calls.find((c) => c.query.includes('retireHero'))?.variables).toEqual({ id: villager.id });
    expect(hero?.status).toBe('RETIRED');
    expect(game.heroesHere()).toEqual([]);
    expect(game.retiredHere().map((h) => h.id)).toEqual([villager.id]);
    expect(game.freeVillager()).toEqual({ offered: true, reason: null });
  });

  it('records the hub refusal instead of throwing', async () => {
    const { game } = setup(playerWith([villager]));
    TestBed.tick();
    await vi.waitFor(() => expect(game.player()).not.toBeNull());
    expect(await game.recruitVillager()).toBeNull();
    expect(game.error()).toContain('free only when no hero');
  });

  it('starts a job with a party, and then knows the open adventure', async () => {
    const { api, game } = setup(playerWith([villager]));
    TestBed.tick();
    await vi.waitFor(() => expect(game.player()).not.toBeNull());
    expect(game.livingHere().map((h) => h.id)).toEqual([villager.id]);

    const adventure = await game.startAdventure('millbrook', 'wolves-on-the-mill-road', [villager.id]);
    expect(api.calls.find((c) => c.query.includes('startAdventure'))?.variables).toEqual({
      at: 'millbrook',
      job: 'wolves-on-the-mill-road',
      heroes: [villager.id],
    });
    expect(adventure.snapshot.heroes.map((h) => h.name)).toEqual(['Wren']);
    expect(game.adventure()?.job.name).toBe('Wolves on the mill road');
    expect(game.busy()).toBe(false);
  });

  it("throws a start's refusal with its code, and reads the player again", async () => {
    const { api, game } = setup(playerWith([villager]));
    TestBed.tick();
    await vi.waitFor(() => expect(game.player()).not.toBeNull());
    await game.startAdventure('millbrook', 'wolves-on-the-mill-road', [villager.id]);
    const reads = api.calls.filter((c) => c.query.includes('me {')).length;

    await expect(game.startAdventure('millbrook', 'wolves-on-the-mill-road', [villager.id])).rejects.toMatchObject({ code: 'ADVENTURE_OPEN' });
    expect(api.calls.filter((c) => c.query.includes('me {'))).toHaveLength(reads + 1);
    expect(game.error()).toBeNull();
    expect(game.busy()).toBe(false);
  });
});
