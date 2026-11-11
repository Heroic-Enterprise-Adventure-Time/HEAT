import { computed, signal } from '@angular/core';
import { screen, waitFor, within } from '@testing-library/angular/zoneless';

import { type FacilityKind, must } from '@heat/engine';

import { routes } from '../app.routes';
import { type CampView, Game, type HeroView, type RecruitOffer, type SeenHeroView, upgradeOffer } from '../game';
import { Refusal } from '../hub';
import { Session } from '../session';
import { fakeSession, PLAYER } from '../testing/fake-session';
import { testLayoutSizes } from '../testing/layout-sizes';
import { itemHolding, listItems, menu, panel, panelBox } from '../testing/page';
import { renderAt } from '../testing/render-at';
import { textsOf } from '../testing/texts-of';
import { CAMP_SCENE_FACTORY } from './camp';
import type { SceneCallbacks, SceneHero } from './scene/camp-scene';

const wren: HeroView = {
  id: 'h1',
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

/** Another player's villager, seen at Millbrook. */
const moss: SeenHeroView = { id: 's1', name: 'Moss', unitType: 'villager', spriteSet: 'villager-07', level: 2 };

/** A game with settable heroes and a recorded recruit and retire, in place of the real one. */
function fakeGame(heroes: HeroView[], seen: SeenHeroView[] = []) {
  const all = signal(heroes);
  const here = computed(() => all().filter((h) => h.status !== 'RETIRED'));
  const fake = {
    heroesHere: here,
    seenHere: signal<readonly SeenHeroView[]>(seen),
    retiredHere: computed(() => all().filter((h) => h.status === 'RETIRED')),
    camp: signal({
      location: 'millbrook',
      name: 'Millbrook',
      hallLevel: 1,
      heroCapacity: 4,
      activeHeroes: heroes.length,
      livingHeroes: heroes.length,
      holdings: [
        { material: 'timber', balance: 60 },
        { material: 'cloth', balance: 3 },
        { material: 'ore', balance: 0 },
      ],
      resourceCapacity: 100,
      warehouseLevel: 1,
      facilities: [
        { kind: 'heroes-hall', level: 1 },
        { kind: 'warehouse', level: 1 },
        { kind: 'mine', level: 0 },
        { kind: 'lumber-camp', level: 0 },
        { kind: 'caravan-hub', level: 0 },
      ] as CampView['facilities'],
    }),
    upgrade: (kind: FacilityKind) => upgradeOffer(fake.camp(), kind),
    built: [] as [string, number][],
    /** A refusal the next build throws, as the hub would. */
    refuseBuild: null as Refusal | null,
    build: (kind: FacilityKind, level: number) => {
      fake.built.push([kind, level]);
      if (fake.refuseBuild) return Promise.reject(fake.refuseBuild);
      const camp = fake.camp();
      fake.camp.set({ ...camp, facilities: camp.facilities.map((f) => (f.kind === kind ? { kind, level } : f)) });
      return Promise.resolve();
    },
    livingHere: computed(() => here().filter((h) => h.status === 'ALIVE')),
    recruits: computed((): RecruitOffer[] => [
      {
        unitType: 'villager',
        cost: here().some((h) => h.status === 'ALIVE') ? [{ material: 'timber', amount: 20, balance: 60 }] : [],
        reason: null,
      },
      { unitType: 'fighter', cost: [{ material: 'ore', amount: 40, balance: 0 }], reason: 'Not enough ore.' },
    ]),
    location: signal('millbrook'),
    // Not read yet: a job's detail waits for it before offering the party.
    player: signal(null),
    adventure: signal<{ snapshot: { heroes: { heroId: string }[] } } | null>(null),
    error: signal<string | null>(null),
    recruited: [] as string[],
    /** A refusal the next recruit throws, as the hub would. */
    refuse: null as Refusal | null,
    recruit: (unitType: string) => {
      fake.recruited.push(unitType);
      if (fake.refuse) return Promise.reject(fake.refuse);
      const hero = all().length === 0 ? wren : { ...wren, id: `h${all().length + 1}`, name: 'Linnet' };
      all.set([...all(), hero]);
      return Promise.resolve(hero);
    },
    retired: [] as string[],
    retire: (id: string) => {
      fake.retired.push(id);
      const hero = { ...must(all().find((h) => h.id === id), `hero ${id}`), status: 'RETIRED' as const, retiredAt: '2026-10-21T12:00:00.000Z' };
      all.set(all().map((h) => (h.id === id ? hero : h)));
      return Promise.resolve(hero);
    },
  };
  return fake;
}

/** A scene that draws nothing and lets the test click its facilities and heroes. */
function fakeScene() {
  const scene = {
    callbacks: null as SceneCallbacks | null,
    shown: [] as { heroes: readonly SceneHero[]; arriving: string | undefined; leaving?: string | undefined }[],
    levels: null as Readonly<Record<string, number>> | null,
    factory: (_host: HTMLElement, _layout: unknown, levels: Readonly<Record<string, number>>, callbacks: SceneCallbacks) => {
      scene.levels = levels;
      scene.callbacks = callbacks;
      return Promise.resolve({
        setHeroes: (heroes: readonly SceneHero[], arriving?: string, leaving?: string) =>
          scene.shown.push({ heroes, arriving, leaving }),
        setLevels: (levels: Readonly<Record<string, number>>) => {
          scene.levels = levels;
        },
        destroy: () => undefined,
      });
    },
  };
  return scene;
}

async function renderCamp(game: ReturnType<typeof fakeGame>, url = '/camp/millbrook') {
  const scene = fakeScene();
  const { router, user } = await renderAt(url, routes, [
    { provide: Game, useValue: game },
    { provide: Session, useValue: fakeSession(PLAYER) },
    { provide: CAMP_SCENE_FACTORY, useValue: scene.factory },
    testLayoutSizes,
  ]);
  await waitFor(() => { expect(scene.callbacks).not.toBeNull(); });
  return { router, scene, user };
}

const marked = (name: string) => menu().getByRole('link', { name, current: 'page' });
const backTo = (name: string) => panel().getByRole('link', { name: `← ${name}` });
/** The entry of the hall's recruit list that offers a unit type. */
const recruit = (unitType: string) => within(itemHolding('Recruit', 'button', `Recruit a ${unitType}`));
const recruitButton = (unitType: string) => recruit(unitType).getByRole('button');
const section = (name: string) => screen.getByRole('region', { name });

describe('Camp', () => {
  it('shows the heroes hall at the camp itself, recruits the free villager and sends it walking in from the hall', async () => {
    const game = fakeGame([]);
    const { router, scene, user } = await renderCamp(game);
    expect(router.url).toBe('/camp/millbrook/heroes-hall');
    expect(panel().getByRole('heading', { name: 'Heroes hall', level: 2 })).toBeInTheDocument();
    expect(panel().getByText('No living heroes.')).toBeInTheDocument();
    expect(recruit('villager').getByText('free')).toBeInTheDocument();

    await user.click(recruitButton('villager'));
    expect(await panel().findByRole('link', { name: 'Wren' })).toBeInTheDocument();
    expect(game.recruited).toEqual(['villager']);
    await waitFor(() => { expect(scene.shown.at(-1)).toEqual({ heroes: [{ id: 'h1', spriteSet: 'villager-01' }], arriving: 'h1' }); });
    expect(recruit('villager').getByText('20 timber, you have 60')).toBeInTheDocument();
  });

  it("shows each recruit's price beside the camp's balance, and why one cannot be had", async () => {
    await renderCamp(fakeGame([wren]));
    expect(recruit('villager').getByText('20 timber, you have 60')).toBeInTheDocument();
    expect(recruitButton('villager')).toBeEnabled();
    expect(recruit('fighter').getByText('40 ore, you have 0')).toBeInTheDocument();
    expect(recruit('fighter').getByText('Not enough ore.')).toBeInTheDocument();
    expect(recruitButton('fighter')).toBeDisabled();
  });

  it("recruits a paid villager, and shows the hub's refusal in place on the recruit it refused", async () => {
    const game = fakeGame([wren]);
    const { user } = await renderCamp(game);
    await user.click(recruitButton('villager'));
    expect(await within(panel().getByRole('list', { name: 'Living' })).findByRole('link', { name: 'Linnet' })).toBeInTheDocument();
    expect(game.recruited).toEqual(['villager']);

    game.refuse = new Refusal('HallFull', 'the heroes hall is full');
    await waitFor(() => { expect(recruitButton('villager')).toBeEnabled(); });
    await user.click(recruitButton('villager'));
    expect(await recruit('villager').findByText('The hall is full.')).toHaveRole('alert');
    expect(game.recruited).toHaveLength(2);
    expect(recruit('fighter').queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says why the player could not be read, as an alert', async () => {
    const game = fakeGame([]);
    game.error.set('The hub could not be reached.');
    await renderCamp(game);
    expect(screen.getByRole('alert')).toHaveTextContent(/^The hub could not be reached\.$/);
  });

  it('groups the roster into the living and the dead', async () => {
    const dead = { ...wren, id: 'h2', name: 'Hob', status: 'DEAD' as const };
    await renderCamp(fakeGame([wren, dead]));
    expect(textsOf(panel().getAllByRole('heading', { level: 3 }))).toEqual(['Living', 'Dead', 'Recruit', 'Upgrade to level 2']);
    const living = within(panel().getByRole('list', { name: 'Living' }));
    expect(living.getByRole('link', { name: 'Wren' })).toBeInTheDocument();
    expect(living.queryByRole('link', { name: 'Hob' })).not.toBeInTheDocument();
    expect(within(panel().getByRole('list', { name: 'Dead' })).getByRole('link', { name: 'Hob' })).toBeInTheDocument();
  });

  it('opens a facility clicked in the scene at its path', async () => {
    const { router, scene } = await renderCamp(fakeGame([]));
    must(scene.callbacks, 'the scene callbacks').onFacility('job-board');
    await waitFor(() => { expect(router.url).toBe('/camp/millbrook/job-board'); });
    expect(await panel().findByRole('heading', { name: 'Job board', level: 2 })).toBeInTheDocument();
    expect(marked('Job board')).toBeInTheDocument();
  });

  it('shows a hero card under the hall, keeping the hall marked in the menu', async () => {
    const { router, scene } = await renderCamp(fakeGame([wren]));
    must(scene.callbacks, 'the scene callbacks').onHero('h1');
    await waitFor(() => { expect(router.url).toBe('/camp/millbrook/heroes-hall/heroes/h1'); });
    expect(await panel().findByRole('heading', { name: 'Wren', level: 2 })).toBeInTheDocument();
    expect(panel().getByText('villager')).toBeInTheDocument();
    expect(marked('Heroes hall')).toBeInTheDocument();
    expect(backTo('Heroes hall')).toHaveAttribute('href', '/camp/millbrook/heroes-hall');
  });

  it('links each roster entry to its card', async () => {
    await renderCamp(fakeGame([wren]));
    expect(panel().getByRole('link', { name: 'Wren' })).toHaveAttribute('href', '/camp/millbrook/heroes-hall/heroes/h1');
  });

  it('walks only the living heroes about the camp', async () => {
    const dead = { ...wren, id: 'h2', name: 'Hob', status: 'DEAD' as const };
    const { scene } = await renderCamp(fakeGame([wren, dead]));
    await waitFor(() => { expect(scene.shown.at(-1)?.heroes.map((h) => h.id)).toEqual(['h1']); });
  });

  it('keeps a hero away on the open adventure out of the camp', async () => {
    const game = fakeGame([wren, { ...wren, id: 'h2', name: 'Hob' }]);
    game.adventure.set({ snapshot: { heroes: [{ heroId: 'h1' }] } });
    const { scene } = await renderCamp(game);
    await waitFor(() => { expect(scene.shown.at(-1)?.heroes.map((h) => h.id)).toEqual(['h2']); });
  });

  it("lists the camp's stock against the warehouse's cap", async () => {
    await renderCamp(fakeGame([]), '/camp/millbrook/warehouse');
    expect(textsOf(listItems('Stock'))).toEqual(['60 of 100 timber', '3 of 100 cloth']);
  });

  it("walks other players' heroes seen here beside the player's own", async () => {
    const { scene } = await renderCamp(fakeGame([wren], [moss]));
    await waitFor(() => {
      expect(scene.shown.at(-1)?.heroes).toEqual([
        { id: 'h1', spriteSet: 'villager-01' },
        { id: 's1', spriteSet: 'villager-07' },
      ]);
    });
  });

  it("opens another player's hero on a read-only card that never says whose it is", async () => {
    const { router, scene } = await renderCamp(fakeGame([wren], [moss]));
    must(scene.callbacks, 'the scene callbacks').onHero('s1');
    await waitFor(() => { expect(router.url).toBe('/camp/millbrook/seen/s1'); });
    expect(await panel().findByRole('heading', { name: 'Moss', level: 2 })).toBeInTheDocument();
    expect(panel().getByText('villager')).toBeInTheDocument();
    expect(panel().getByText('2')).toBeInTheDocument();
    expect(panelBox()).not.toHaveTextContent('@');
    expect(panel().queryByRole('button')).not.toBeInTheDocument();
  });

  it('retires a hero from its card behind a confirmation, and walks it back into the hall', async () => {
    const game = fakeGame([wren]);
    const { scene, user } = await renderCamp(game, '/camp/millbrook/heroes-hall/heroes/h1');
    const confirmation = { name: /Retiring is permanent\./ };

    await user.click(panel().getByRole('button', { name: 'Retire' }));
    expect(await panel().findByRole('group', confirmation)).toBeInTheDocument();
    await user.click(panel().getByRole('button', { name: 'Keep' }));
    await waitFor(() => { expect(panel().queryByRole('group', confirmation)).not.toBeInTheDocument(); });
    expect(game.retired).toEqual([]);

    await user.click(panel().getByRole('button', { name: 'Retire' }));
    await user.click(await panel().findByRole('button', { name: 'Retire Wren' }));
    expect(await panel().findByText('retired on Oct 21, 2026')).toBeInTheDocument();
    expect(game.retired).toEqual(['h1']);
    expect(panel().queryByRole('button')).not.toBeInTheDocument();
    await waitFor(() => { expect(scene.shown.at(-1)).toEqual({ heroes: [], arriving: undefined, leaving: 'h1' }); });
  });

  it('shows the retired apart from the active heroes, collapsed', async () => {
    const retired = { ...wren, id: 'h3', name: 'Ash', status: 'RETIRED' as const, retiredAt: '2026-10-21T12:00:00.000Z' };
    await renderCamp(fakeGame([wren, retired]));
    const living = within(panel().getByRole('list', { name: 'Living' }));
    expect(living.getByRole('link', { name: 'Wren' })).toBeInTheDocument();
    expect(living.queryByRole('link', { name: 'Ash' })).not.toBeInTheDocument();
    const details = panel().getByRole('group');
    expect(details).not.toHaveAttribute('open');
    expect(within(details).getByText('Retired (1)')).toBeInTheDocument();
    expect(within(details).getByRole('link', { name: 'Ash' })).toHaveAttribute('href', '/camp/millbrook/heroes-hall/heroes/h3');
  });

  it('lists every facility of the camp in the menu, built or not, each linking to its path', async () => {
    await renderCamp(fakeGame([]));
    expect(textsOf(menu().getAllByRole('link'))).toEqual(['Heroes hall', 'Job board', 'Warehouse', 'Lumber camp', 'Mine', 'Caravan hub']);
    const mine = menu().getByRole('link', { name: 'Mine' });
    const hall = menu().getByRole('link', { name: 'Heroes hall' });
    expect(mine).toHaveAttribute('href', '/camp/millbrook/mine');
    expect(mine).toHaveClass('unbuilt');
    expect(hall).not.toHaveClass('unbuilt');
    expect(within(hall).getByRole('presentation')).toHaveAttribute('src', 'art/icons/heroes-hall.png');
  });

  it('hands the scene each facility level: 0 for the ones not built', async () => {
    const { scene } = await renderCamp(fakeGame([]));
    expect(scene.levels).toEqual({ 'heroes-hall': 1, 'job-board': 1, warehouse: 1, 'lumber-camp': 0, mine: 0, 'caravan-hub': 0 });
  });

  it('says what an unbuilt facility does and that it is not built', async () => {
    await renderCamp(fakeGame([]), '/camp/millbrook/mine');
    expect(panel().getByRole('heading', { name: 'Mine', level: 2 })).toBeInTheDocument();
    expect(panel().getByText('Not built yet.')).toBeInTheDocument();
    expect(panelBox()).toHaveTextContent('mining runs');
    expect(marked('Mine')).toBeInTheDocument();
  });

  it("builds the mine with its cost beside the camp's balance, and draws it built", async () => {
    const game = fakeGame([]);
    const { scene, user } = await renderCamp(game, '/camp/millbrook/mine');
    const build = section('Build');
    expect(within(build).getByRole('heading', { name: 'Build' })).toBeInTheDocument();
    expect(within(build).getByText('60 timber, you have 60; 3 cloth, you have 3')).toBeInTheDocument();
    await user.click(within(build).getByRole('button', { name: 'Build' }));
    expect(await panel().findByText('Level 1.')).toBeInTheDocument();
    expect(game.built).toEqual([['mine', 1]]);
    expect(panel().getByText('At its highest level here.')).toBeInTheDocument();
    await waitFor(() => { expect(scene.levels?.['mine']).toBe(1); });
  });

  it("lists the mine's jobs once it is built, each leading to its detail under the mine (Issue-133)", async () => {
    const game = fakeGame([]);
    const { user } = await renderCamp(game, '/camp/millbrook/mine');
    expect(panel().queryByRole('list', { name: 'Jobs' })).not.toBeInTheDocument();
    await user.click(panel().getByRole('button', { name: 'Build' }));
    const job = await panel().findByRole('link', { name: 'Ore from the hill' });
    expect(job).toHaveAttribute('href', '/camp/millbrook/mine/jobs/ore-from-the-hill');
    expect(listItems('Jobs')).toHaveLength(1);
    expect(within(itemHolding('Jobs', 'link', 'Ore from the hill')).getByText('up to 60 ore')).toBeInTheDocument();
    expect(game.built).toEqual([['mine', 1]]);
  });

  it("shows a mine's job under the mine once built, keeping the mine marked", async () => {
    const game = fakeGame([wren]);
    const built = game.camp();
    game.camp.set({ ...built, facilities: built.facilities.map((f) => (f.kind === 'mine' ? { kind: 'mine', level: 1 } : f)) });
    await renderCamp(game, '/camp/millbrook/mine/jobs/ore-from-the-hill');
    expect(panel().getByRole('heading', { name: 'Ore from the hill', level: 2 })).toBeInTheDocument();
    expect(textsOf(listItems('Stages'))).toContain('Gather ore from 2 ore veins');
    expect(backTo('Mine')).toHaveAttribute('href', '/camp/millbrook/mine');
    expect(marked('Mine')).toBeInTheDocument();
  });

  it('has no such job under a mine not built', async () => {
    await renderCamp(fakeGame([wren]), '/camp/millbrook/mine/jobs/ore-from-the-hill');
    expect(panel().getByText('The mine has no such job.')).toBeInTheDocument();
  });

  it('keeps a job off any poster but its own', async () => {
    await renderCamp(fakeGame([wren]), '/camp/millbrook/job-board/jobs/ore-from-the-hill');
    expect(panel().getByText('The job board has no such job.')).toBeInTheDocument();
  });

  it("shows the hub's refusal of a build in place", async () => {
    const game = fakeGame([]);
    game.refuseBuild = new Refusal('InsufficientResources', 'level 1 costs 60 timber');
    const { user } = await renderCamp(game, '/camp/millbrook/mine');
    await user.click(panel().getByRole('button', { name: 'Build' }));
    expect(await within(section('Build')).findByText('The camp cannot pay for this now.')).toHaveRole('alert');
    expect(game.built).toHaveLength(1);
  });

  it('disables a build the camp cannot have, and says why', async () => {
    await renderCamp(fakeGame([]), '/camp/millbrook/caravan-hub');
    expect(panel().getByRole('button', { name: 'Build' })).toBeDisabled();
    expect(panel().getByText('Needs a level 2 warehouse first.')).toBeInTheDocument();
  });

  it("offers the warehouse's next level, with what it holds", async () => {
    await renderCamp(fakeGame([]), '/camp/millbrook/warehouse');
    const upgrade = section('Upgrade to level 2');
    expect(within(upgrade).getByText('Holds 200 of each resource.')).toBeInTheDocument();
    expect(within(upgrade).getByText('Not enough timber or ore.')).toBeInTheDocument();
  });

  it("offers the hall's next level, with what it holds", async () => {
    await renderCamp(fakeGame([]));
    const upgrade = section('Upgrade to level 2');
    expect(within(upgrade).getByText('Holds 6 heroes.')).toBeInTheDocument();
    expect(within(upgrade).getByText('Not enough timber or cloth.')).toBeInTheDocument();
  });

  it('sends a facility the camp does not have back to the hall', async () => {
    const { router } = await renderCamp(fakeGame([]), '/camp/millbrook/forge');
    await waitFor(() => { expect(router.url).toBe('/camp/millbrook/heroes-hall'); });
  });

  it('sends a camp with no layout to the starting camp', async () => {
    const { router } = await renderCamp(fakeGame([]), '/camp/atlantis');
    await waitFor(() => { expect(router.url).toBe('/camp/millbrook/heroes-hall'); });
  });
});
