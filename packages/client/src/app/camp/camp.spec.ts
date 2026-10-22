import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../app.routes';
import { Game, type HeroView, type SeenHeroView } from '../game';
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
    camp: signal({ location: 'millbrook', name: 'Millbrook', hallLevel: 1, heroCapacity: 4, activeHeroes: heroes.length, livingHeroes: heroes.length }),
    freeVillager: computed(() =>
      here().length === 0 ? { offered: true, reason: null } : { offered: false, reason: 'The villager is free only when no hero here is alive.' },
    ),
    location: signal('millbrook'),
    adventure: signal(null),
    busy: signal(false),
    error: signal<string | null>(null),
    recruited: 0,
    recruitVillager: async () => {
      fake.recruited++;
      all.set([wren]);
      return wren;
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
    expect(page.textContent).toContain('No heroes yet.');

    const recruit = [...page.querySelectorAll('button')].find((b) => b.textContent?.includes('Recruit a villager'));
    recruit!.click();
    await vi.waitFor(() => expect(game.recruited).toBe(1));
    await settle();
    expect(scene.shown.at(-1)).toEqual({ heroes: [{ id: 'h1', spriteSet: 'villager-01' }], arriving: 'h1' });
    expect(page.querySelector('.roster')?.textContent).toContain('Wren');
    expect(page.textContent).toContain('The villager is free only when no hero here is alive.');
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

  it('sends a facility the camp does not have back to the hall', async () => {
    const { router } = await render(fakeGame([]), '/camp/millbrook/forge');
    await vi.waitFor(() => expect(router.url).toBe('/camp/millbrook/heroes-hall'));
  });

  it('sends a camp with no layout to the starting camp', async () => {
    const { router } = await render(fakeGame([]), '/camp/atlantis');
    await vi.waitFor(() => expect(router.url).toBe('/camp/millbrook/heroes-hall'));
  });
});
