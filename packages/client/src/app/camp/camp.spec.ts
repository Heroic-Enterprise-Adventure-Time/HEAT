import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
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
    factory: async (_host: HTMLElement, _layout: unknown, callbacks: SceneCallbacks) => {
      scene.callbacks = callbacks;
      return {
        setHeroes: (heroes: readonly SceneHero[], arriving?: string) => scene.shown.push({ heroes, arriving }),
        destroy: () => undefined,
      };
    },
  };
  return scene;
}

async function render(game: ReturnType<typeof fakeGame>) {
  const scene = fakeScene();
  await TestBed.configureTestingModule({
    imports: [Camp],
    providers: [
      { provide: Game, useValue: game },
      { provide: CAMP_SCENE_FACTORY, useValue: scene.factory },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(Camp);
  await fixture.whenStable();
  await vi.waitFor(() => expect(scene.callbacks).not.toBeNull());
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  return { fixture, scene, settle, page: fixture.nativeElement as HTMLElement };
}

describe('Camp', () => {
  it('opens the heroes hall on a click, recruits the free villager and sends it walking in from the hall', async () => {
    const game = fakeGame([]);
    const { scene, settle, page } = await render(game);
    scene.callbacks!.onFacility('heroes-hall');
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

  it('shows a hero card when a hero is clicked', async () => {
    const { scene, settle, page } = await render(fakeGame([wren]));
    scene.callbacks!.onHero('h1');
    await settle();
    expect(page.querySelector('aside h2')?.textContent).toBe('Wren');
    expect(page.querySelector('dl')?.textContent).toContain('villager');
    expect(page.querySelector('dl')?.textContent).toContain('alive');
  });

  it('walks only the living heroes about the camp', async () => {
    const dead = { ...wren, id: 'h2', name: 'Hob', status: 'DEAD' as const };
    const { scene } = await render(fakeGame([wren, dead]));
    expect(scene.shown.at(-1)?.heroes.map((h) => h.id)).toEqual(['h1']);
  });

  it('opens nothing for the job board yet', async () => {
    const { scene, settle, page } = await render(fakeGame([]));
    scene.callbacks!.onFacility('job-board');
    await settle();
    expect(page.querySelector('aside')).toBeNull();
  });
});
