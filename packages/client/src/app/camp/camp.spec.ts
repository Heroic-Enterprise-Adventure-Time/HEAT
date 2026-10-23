import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../app.routes';
import { ApiError } from '../api';
import type { FacilityKind } from '@heat/engine';
import { Game, upgradeOffer, type CampView, type HeroView, type RecruitOffer, type SeenHeroView } from '../game';
import { Session } from '../session';
import type { SceneCallbacks, SceneHero } from './scene/camp-scene';
import { CAMP_SCENE_FACTORY } from './camp';

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
    refuseBuild: null as ApiError | null,
    build: async (kind: FacilityKind, level: number) => {
      fake.built.push([kind, level]);
      if (fake.refuseBuild) throw fake.refuseBuild;
      const camp = fake.camp();
      fake.camp.set({ ...camp, facilities: camp.facilities.map((f) => (f.kind === kind ? { kind, level } : f)) });
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
    busy: signal(false),
    error: signal<string | null>(null),
    recruited: [] as string[],
    /** A refusal the next recruit throws, as the hub would. */
    refuse: null as ApiError | null,
    recruit: async (unitType: string) => {
      fake.recruited.push(unitType);
      if (fake.refuse) throw fake.refuse;
      const hero = all().length === 0 ? wren : { ...wren, id: `h${all().length + 1}`, name: 'Linnet' };
      all.set([...all(), hero]);
      return hero;
    },
    retired: [] as string[],
    retire: async (id: string) => {
      fake.retired.push(id);
      const hero = { ...all().find((h) => h.id === id)!, status: 'RETIRED' as const, retiredAt: '2026-10-21T12:00:00.000Z' };
      all.set(all().map((h) => (h.id === id ? hero : h)));
      return hero;
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
    factory: async (_host: HTMLElement, _layout: unknown, levels: Readonly<Record<string, number>>, callbacks: SceneCallbacks) => {
      scene.levels = levels;
      scene.callbacks = callbacks;
      return {
        setHeroes: (heroes: readonly SceneHero[], arriving?: string, leaving?: string) =>
          scene.shown.push({ heroes, arriving, leaving }),
        setLevels: (levels: Readonly<Record<string, number>>) => {
          scene.levels = levels;
        },
        destroy: () => undefined,
      };
    },
  };
  return scene;
}

async function render(game: ReturnType<typeof fakeGame>, url = '/camp/millbrook') {
  const scene = fakeScene();
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes),
      { provide: Game, useValue: game },
      { provide: Session, useValue: { user: signal({ email: 'player@example.com', name: null, accessToken: 't' }) } },
      { provide: CAMP_SCENE_FACTORY, useValue: scene.factory },
    ],
  });
  const harness = await RouterTestingHarness.create(url);
  await vi.waitFor(() => expect(scene.callbacks).not.toBeNull());
  const router = TestBed.inject(Router);
  const settle = async () => {
    harness.detectChanges();
    await harness.fixture.whenStable();
  };
  return { harness, router, scene, settle, page: harness.routeNativeElement as HTMLElement };
}

const current = (page: HTMLElement) => page.querySelector('nav.menu a[aria-current="page"]')?.textContent?.trim();

describe('Camp', () => {
  it('shows the heroes hall at the camp itself, recruits the free villager and sends it walking in from the hall', async () => {
    const game = fakeGame([]);
    const { router, scene, settle, page } = await render(game);
    expect(router.url).toBe('/camp/millbrook/heroes-hall');
    expect(page.querySelector('aside h2')?.textContent).toBe('Heroes hall');
    expect(page.textContent).toContain('No living heroes.');
    expect(page.querySelector('.recruits li')?.textContent).toContain('free');

    const recruit = [...page.querySelectorAll('button')].find((b) => b.textContent?.includes('Recruit a villager'));
    recruit!.click();
    await vi.waitFor(() => expect(game.recruited).toEqual(['villager']));
    await settle();
    expect(scene.shown.at(-1)).toEqual({ heroes: [{ id: 'h1', spriteSet: 'villager-01' }], arriving: 'h1' });
    expect(page.querySelector('.roster')?.textContent).toContain('Wren');
    expect(page.querySelector('.recruits li')?.textContent).toContain('20 timber, you have 60');
  });

  it("shows each recruit's price beside the camp's balance, and why one cannot be had", async () => {
    const { page } = await render(fakeGame([wren]));
    const [villager, fighter] = [...page.querySelectorAll('.recruits li')];
    expect(villager?.textContent).toContain('Recruit a villager');
    expect(villager?.textContent).toContain('20 timber, you have 60');
    expect(villager?.querySelector('button')?.disabled).toBe(false);
    expect(fighter?.textContent).toContain('40 ore, you have 0');
    expect(fighter?.querySelector('.note')?.textContent).toBe('Not enough ore.');
    expect(fighter?.querySelector('button')?.disabled).toBe(true);
  });

  it("recruits a paid villager, and shows the hub's refusal in place on the recruit it refused", async () => {
    const game = fakeGame([wren]);
    const { settle, page } = await render(game);
    const button = () => page.querySelector('.recruits li button') as HTMLButtonElement;
    button().click();
    await vi.waitFor(() => expect(game.recruited).toEqual(['villager']));
    await settle();
    expect(page.querySelector('.roster.living')?.textContent).toContain('Linnet');

    game.refuse = new ApiError('the heroes hall is full', 'HALL_FULL');
    button().click();
    await vi.waitFor(() => expect(game.recruited).toHaveLength(2));
    await settle();
    const [villager, fighter] = [...page.querySelectorAll('.recruits li')];
    expect(villager?.querySelector('.refusal')?.textContent).toBe('The hall is full.');
    expect(fighter?.querySelector('.refusal')).toBeNull();
  });

  it('groups the roster into the living and the dead', async () => {
    const dead = { ...wren, id: 'h2', name: 'Hob', status: 'DEAD' as const };
    const { page } = await render(fakeGame([wren, dead]));
    expect([...page.querySelectorAll('aside h3')].map((h) => h.textContent)).toEqual(['Living', 'Dead', 'Recruit', 'Upgrade to level 2']);
    expect(page.querySelector('.roster.living')?.textContent).toContain('Wren');
    expect(page.querySelector('.roster.living')?.textContent).not.toContain('Hob');
    expect(page.querySelector('.roster.dead')?.textContent).toContain('Hob');
  });

  it('opens a facility clicked in the scene at its path', async () => {
    const { router, scene, settle, page } = await render(fakeGame([]));
    scene.callbacks!.onFacility('job-board');
    await vi.waitFor(() => expect(router.url).toBe('/camp/millbrook/job-board'));
    await settle();
    expect(page.querySelector('aside h2')?.textContent).toBe('Job board');
    expect(current(page)).toBe('Job board');
  });

  it('shows a hero card under the hall, keeping the hall marked in the menu', async () => {
    const { router, scene, settle, page } = await render(fakeGame([wren]));
    scene.callbacks!.onHero('h1');
    await vi.waitFor(() => expect(router.url).toBe('/camp/millbrook/heroes-hall/heroes/h1'));
    await settle();
    expect(page.querySelector('aside h2')?.textContent).toBe('Wren');
    expect(page.querySelector('dl')?.textContent).toContain('villager');
    expect(current(page)).toBe('Heroes hall');
    expect(page.querySelector('aside .back')?.getAttribute('href')).toBe('/camp/millbrook/heroes-hall');
  });

  it('links each roster entry to its card', async () => {
    const { page } = await render(fakeGame([wren]));
    expect(page.querySelector('.roster a')?.getAttribute('href')).toBe('/camp/millbrook/heroes-hall/heroes/h1');
  });

  it('walks only the living heroes about the camp', async () => {
    const dead = { ...wren, id: 'h2', name: 'Hob', status: 'DEAD' as const };
    const { scene } = await render(fakeGame([wren, dead]));
    expect(scene.shown.at(-1)?.heroes.map((h) => h.id)).toEqual(['h1']);
  });

  it('keeps a hero away on the open adventure out of the camp', async () => {
    const game = fakeGame([wren, { ...wren, id: 'h2', name: 'Hob' }]);
    game.adventure.set({ snapshot: { heroes: [{ heroId: 'h1' }] } });
    const { scene } = await render(game);
    expect(scene.shown.at(-1)?.heroes.map((h) => h.id)).toEqual(['h2']);
  });

  it("lists the camp's stock against the warehouse's cap", async () => {
    const { page } = await render(fakeGame([]), '/camp/millbrook/warehouse');
    expect([...page.querySelectorAll('.stock li')].map((li) => li.textContent?.trim())).toEqual(['60 of 100 timber', '3 of 100 cloth']);
  });

  it("walks other players' heroes seen here beside the player's own", async () => {
    const { scene } = await render(fakeGame([wren], [moss]));
    expect(scene.shown.at(-1)?.heroes).toEqual([
      { id: 'h1', spriteSet: 'villager-01' },
      { id: 's1', spriteSet: 'villager-07' },
    ]);
  });

  it("opens another player's hero on a read-only card that never says whose it is", async () => {
    const { router, scene, settle, page } = await render(fakeGame([wren], [moss]));
    scene.callbacks!.onHero('s1');
    await vi.waitFor(() => expect(router.url).toBe('/camp/millbrook/seen/s1'));
    await settle();
    const card = page.querySelector('aside')!;
    expect(card.querySelector('h2')?.textContent).toBe('Moss');
    expect(card.querySelector('dl')?.textContent).toContain('villager');
    expect(card.querySelector('dl')?.textContent).toContain('2');
    expect(card.textContent).not.toContain('@');
    expect(card.querySelector('button')).toBeNull();
  });

  it('retires a hero from its card behind a confirmation, and walks it back into the hall', async () => {
    const game = fakeGame([wren]);
    const { scene, settle, page } = await render(game, '/camp/millbrook/heroes-hall/heroes/h1');
    const button = (text: string) => [...page.querySelectorAll('aside button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;

    button('Retire')!.click();
    await settle();
    expect(page.querySelector('.confirm')?.textContent).toContain('Retiring is permanent.');
    button('Keep')!.click();
    await settle();
    expect(page.querySelector('.confirm')).toBeNull();
    expect(game.retired).toEqual([]);

    button('Retire')!.click();
    await settle();
    button('Retire Wren')!.click();
    await vi.waitFor(() => expect(game.retired).toEqual(['h1']));
    await settle();
    expect(page.querySelector('dl')?.textContent).toContain('retired on Oct 21, 2026');
    expect(page.querySelectorAll('aside button')).toHaveLength(0);
    expect(scene.shown.at(-1)).toEqual({ heroes: [], arriving: undefined, leaving: 'h1' });
  });

  it('shows the retired apart from the active heroes, collapsed', async () => {
    const retired = { ...wren, id: 'h3', name: 'Ash', status: 'RETIRED' as const, retiredAt: '2026-10-21T12:00:00.000Z' };
    const { page } = await render(fakeGame([wren, retired]));
    const [active, apart] = [...page.querySelectorAll('.roster')];
    expect(active?.textContent).toContain('Wren');
    expect(active?.textContent).not.toContain('Ash');
    const details = page.querySelector('details.retired') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')?.textContent).toBe('Retired (1)');
    expect(apart?.querySelector('a')?.getAttribute('href')).toBe('/camp/millbrook/heroes-hall/heroes/h3');
  });

  it('lists every facility of the camp in the menu, built or not, each linking to its path', async () => {
    const { page } = await render(fakeGame([]));
    const entries = [...page.querySelectorAll<HTMLAnchorElement>('nav.menu a')];
    expect(entries.map((a) => a.textContent?.trim())).toEqual(['Heroes hall', 'Job board', 'Warehouse', 'Lumber camp', 'Mine', 'Caravan hub']);
    expect(entries[4]!.getAttribute('href')).toBe('/camp/millbrook/mine');
    expect(entries[4]!.classList).toContain('unbuilt');
    expect(entries[0]!.classList).not.toContain('unbuilt');
    expect(entries[0]!.querySelector('img')?.getAttribute('src')).toBe('art/icons/heroes-hall.png');
  });

  it('hands the scene each facility level: 0 for the ones not built', async () => {
    const { scene } = await render(fakeGame([]));
    expect(scene.levels).toEqual({ 'heroes-hall': 1, 'job-board': 1, warehouse: 1, 'lumber-camp': 0, mine: 0, 'caravan-hub': 0 });
  });

  it('says what an unbuilt facility does and that it is not built', async () => {
    const { page } = await render(fakeGame([]), '/camp/millbrook/mine');
    expect(page.querySelector('aside h2')?.textContent).toBe('Mine');
    expect(page.querySelector('aside')?.textContent).toContain('Not built yet.');
    expect(page.querySelector('aside')?.textContent).toContain('mining runs');
    expect(current(page)).toBe('Mine');
  });

  it("builds the mine with its cost beside the camp's balance, and draws it built", async () => {
    const game = fakeGame([]);
    const { page, scene, settle } = await render(game, '/camp/millbrook/mine');
    const build = () => page.querySelector('.build') as HTMLElement;
    expect(build().querySelector('h3')?.textContent).toBe('Build');
    expect(build().querySelector('.price')?.textContent).toBe('60 timber, you have 60; 3 cloth, you have 3');
    (build().querySelector('button') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(game.built).toEqual([['mine', 1]]));
    await settle();
    expect(page.querySelector('aside')?.textContent).toContain('Level 1.');
    expect(page.querySelector('aside')?.textContent).toContain('At its highest level here.');
    await vi.waitFor(() => expect(scene.levels?.['mine']).toBe(1));
  });

  it("lists the mine's jobs once it is built, each leading to its detail under the mine (Issue-133)", async () => {
    const game = fakeGame([]);
    const { page, settle } = await render(game, '/camp/millbrook/mine');
    expect(page.querySelector('aside .jobs')).toBeNull();
    (page.querySelector('.build button') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(game.built).toEqual([['mine', 1]]));
    await settle();
    const jobs = [...page.querySelectorAll('aside .jobs li')].map((li) => [...li.children].map((c) => c.textContent?.trim()));
    expect(jobs).toEqual([['Ore from the hill', 'up to 40 ore']]);
    expect(page.querySelector('aside .jobs a')?.getAttribute('href')).toBe('/camp/millbrook/mine/jobs/ore-from-the-hill');
  });

  it("shows a mine's job under the mine once built, keeping the mine marked, and no such job before", async () => {
    const game = fakeGame([wren]);
    const built = game.camp();
    game.camp.set({ ...built, facilities: built.facilities.map((f) => (f.kind === 'mine' ? { kind: 'mine', level: 1 } : f)) });
    const { page } = await render(game, '/camp/millbrook/mine/jobs/ore-from-the-hill');
    expect(page.querySelector('aside h2')?.textContent).toBe('Ore from the hill');
    expect([...page.querySelectorAll('.stages li')].map((li) => li.textContent?.trim())).toContain('Gather ore from 2 ore veins, up to 40');
    expect(page.querySelector('aside .back')?.textContent?.trim()).toBe('← Mine');
    expect(page.querySelector('aside .back')?.getAttribute('href')).toBe('/camp/millbrook/mine');
    expect(current(page)).toBe('Mine');

    TestBed.resetTestingModule();
    const unbuilt = await render(fakeGame([wren]), '/camp/millbrook/mine/jobs/ore-from-the-hill');
    expect(unbuilt.page.querySelector('aside')?.textContent).toContain('The mine has no such job.');
  });

  it('keeps a job off any poster but its own', async () => {
    const { page } = await render(fakeGame([wren]), '/camp/millbrook/job-board/jobs/ore-from-the-hill');
    expect(page.querySelector('aside')?.textContent).toContain('The job board has no such job.');
  });

  it("shows the hub's refusal of a build in place", async () => {
    const game = fakeGame([]);
    game.refuseBuild = new ApiError('level 1 costs 60 timber', 'INSUFFICIENT_RESOURCES');
    const { page, settle } = await render(game, '/camp/millbrook/mine');
    (page.querySelector('.build button') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(game.built).toHaveLength(1));
    await settle();
    expect(page.querySelector('.build .refusal')?.textContent).toBe('The camp cannot pay for this now.');
  });

  it('disables a build the camp cannot have, and says why', async () => {
    const { page } = await render(fakeGame([]), '/camp/millbrook/caravan-hub');
    expect((page.querySelector('.build button') as HTMLButtonElement).disabled).toBe(true);
    expect(page.querySelector('.build .note')?.textContent).toBe('Needs a level 2 warehouse first.');
  });

  it("offers the warehouse's and the hall's next level, with what it holds", async () => {
    const { page } = await render(fakeGame([]), '/camp/millbrook/warehouse');
    expect(page.querySelector('.build h3')?.textContent).toBe('Upgrade to level 2');
    expect(page.querySelector('.build')?.textContent).toContain('Holds 200 of each resource.');
    expect(page.querySelector('.build .note')?.textContent).toBe('Not enough timber or ore.');
    TestBed.resetTestingModule();
    const hall = await render(fakeGame([]));
    expect(hall.page.querySelector('.build')?.textContent).toContain('Holds 6 heroes.');
    expect(hall.page.querySelector('.build .note')?.textContent).toBe('Not enough timber or cloth.');
  });

  it('sends a facility the camp does not have back to the hall', async () => {
    const { router } = await render(fakeGame([]), '/camp/millbrook/forge');
    await vi.waitFor(() => expect(router.url).toBe('/camp/millbrook/heroes-hall'));
  });

  it('sends a camp with no layout to the starting camp', async () => {
    const { router } = await render(fakeGame([]), '/camp/atlantis');
    await vi.waitFor(() => expect(router.url).toBe('/camp/millbrook/heroes-hall'));
  });
});
