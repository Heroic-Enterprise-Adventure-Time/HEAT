import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Game, type HeroView } from '../game';
import type { SceneCallbacks, SceneHero } from './scene/camp-scene';
import { CAMP_SCENE_FACTORY, Camp } from './camp';

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
};

/** A game with settable heroes and a recorded recruit, in place of the real one. */
function fakeGame(heroes: HeroView[]) {
  const here = signal(heroes);
  const fake = {
    heroesHere: here,
    camp: signal({ location: 'millbrook', name: 'Millbrook', hallLevel: 1, heroCapacity: 4, activeHeroes: heroes.length, livingHeroes: heroes.length }),
    freeVillager: computed(() =>
      here().length === 0 ? { offered: true, reason: null } : { offered: false, reason: 'The villager is free only when no hero here is alive.' },
    ),
    location: signal('millbrook'),
    busy: signal(false),
    error: signal<string | null>(null),
    recruited: 0,
    recruitVillager: async () => {
      fake.recruited++;
      here.set([wren]);
      return wren;
    },
  };
  return fake;
}

/** A scene that draws nothing and lets the test click its facilities and heroes. */
function fakeScene() {
  const scene = {
    callbacks: null as SceneCallbacks | null,
    shown: [] as { heroes: readonly SceneHero[]; arriving: string | undefined }[],
    levels: null as Readonly<Record<string, number>> | null,
    factory: async (_host: HTMLElement, _layout: unknown, levels: Readonly<Record<string, number>>, callbacks: SceneCallbacks) => {
      scene.levels = levels;
      scene.callbacks = callbacks;
      return {
        setHeroes: (heroes: readonly SceneHero[], arriving?: string) => scene.shown.push({ heroes, arriving }),
        destroy: () => undefined,
      };
    },
  };
  return scene;
}

async function render(game: ReturnType<typeof fakeGame>, url = '/') {
  const scene = fakeScene();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '', component: Camp }]),
      { provide: Game, useValue: game },
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

describe('Camp', () => {
  it('opens the heroes hall on a click, recruits the free villager and sends it walking in from the hall', async () => {
    const game = fakeGame([]);
    const { router, scene, settle, page } = await render(game);
    scene.callbacks!.onFacility('heroes-hall');
    await vi.waitFor(() => expect(router.url).toBe('/?open=heroes-hall'));
    await settle();
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

  it('shows a hero card when a hero is clicked, in the URL, with a way back to the hall', async () => {
    const { router, scene, settle, page } = await render(fakeGame([wren]));
    scene.callbacks!.onHero('h1');
    await vi.waitFor(() => expect(router.url).toBe('/?hero=h1'));
    await settle();
    expect(page.querySelector('aside h2')?.textContent).toBe('Wren');
    expect(page.querySelector('aside .back')?.getAttribute('href')).toBe('/?open=heroes-hall');
    expect(page.querySelector('dl')?.textContent).toContain('villager');
    expect(page.querySelector('dl')?.textContent).toContain('alive');
  });

  it('walks only the living heroes about the camp', async () => {
    const dead = { ...wren, id: 'h2', name: 'Hob', status: 'DEAD' as const };
    const { scene } = await render(fakeGame([wren, dead]));
    expect(scene.shown.at(-1)?.heroes.map((h) => h.id)).toEqual(['h1']);
  });

  it('lists every facility of the camp in the menu, built or not, each linking to its panel', async () => {
    const { page } = await render(fakeGame([]));
    const entries = [...page.querySelectorAll<HTMLAnchorElement>('nav.menu a')];
    expect(entries.map((a) => a.textContent?.trim())).toEqual(['Heroes hall', 'Job board', 'Warehouse', 'Lumber camp', 'Mine', 'Caravan hub']);
    expect(entries[4]!.getAttribute('href')).toBe('/?open=mine');
    expect(entries[4]!.classList).toContain('unbuilt');
    expect(entries[0]!.classList).not.toContain('unbuilt');
    expect(entries[0]!.querySelector('img')?.getAttribute('src')).toBe('art/icons/heroes-hall.png');
  });

  it('hands the scene each facility level: 0 for the ones not built', async () => {
    const { scene } = await render(fakeGame([]));
    expect(scene.levels).toEqual({ 'heroes-hall': 1, 'job-board': 1, warehouse: 1, 'lumber-camp': 0, mine: 0, 'caravan-hub': 0 });
  });

  it('always shows a panel: the heroes hall when the address names none', async () => {
    const { page } = await render(fakeGame([]));
    expect(page.querySelector('aside h2')?.textContent).toBe('Heroes hall');
    expect(page.querySelector('nav.menu a[aria-current="page"]')?.textContent?.trim()).toBe('Heroes hall');
    expect(page.querySelector('aside .close')).toBeNull();
  });

  it('opens the panel the URL names and marks its menu entry', async () => {
    const { page } = await render(fakeGame([]), '/?open=job-board');
    expect(page.querySelector('aside h2')?.textContent).toBe('Job board');
    expect(page.querySelector('nav.menu a[aria-current="page"]')?.textContent?.trim()).toBe('Job board');
  });

  it('says what an unbuilt facility does and that it is not built', async () => {
    const { page } = await render(fakeGame([]), '/?open=mine');
    expect(page.querySelector('aside h2')?.textContent).toBe('Mine');
    expect(page.querySelector('aside')?.textContent).toContain('Not built yet.');
    expect(page.querySelector('aside')?.textContent).toContain('mining runs');
  });

  it('falls back to the hall for a panel the camp does not have', async () => {
    const { page } = await render(fakeGame([]), '/?open=forge');
    expect(page.querySelector('aside h2')?.textContent).toBe('Heroes hall');
  });
});
