import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ApiError } from '../../api';
import { routes } from '../../app.routes';
import { Game, type AdventureView, type HeroView } from '../../game';
import { Session } from '../../session';
import { CAMP_SCENE_FACTORY } from '../camp';
import { BATTLE_SCENE_FACTORY, FRAME_LOOP } from '../../adventure/adventure';

function hero(id: string, name: string, status: HeroView['status'] = 'ALIVE'): HeroView {
  return {
    id,
    name,
    unitType: 'villager',
    spriteSet: 'villager-01',
    location: 'millbrook',
    recruitedAt: '2026-10-20T07:00:00.000Z',
    level: 1,
    xp: 0,
    status,
    retiredAt: null,
  };
}

const party = [hero('h1', 'Wren'), hero('h2', 'Moss'), hero('h3', 'Lark'), hero('h4', 'Fen'), hero('h5', 'Ash')];

/** A game with settable heroes and adventure, and a start that answers as the test says, in place of the real one. */
function fakeGame(heroes: HeroView[], answer: (heroIds: readonly string[]) => AdventureView | ApiError = adventureOf) {
  const all = signal(heroes);
  const open = signal<AdventureView | null>(null);
  const here = computed(() => all().filter((h) => h.status !== 'RETIRED'));
  const fake = {
    heroesHere: here,
    livingHere: computed(() => here().filter((h) => h.status === 'ALIVE')),
    seenHere: signal([]),
    retiredHere: computed(() => all().filter((h) => h.status === 'RETIRED')),
    camp: signal({
      location: 'millbrook',
      name: 'Millbrook',
      hallLevel: 1,
      heroCapacity: 4,
      activeHeroes: heroes.length,
      livingHeroes: heroes.length,
      holdings: [{ material: 'timber', balance: 90 }],
      resourceCapacity: 100,
    }),
    recruits: signal([]),
    location: signal('millbrook'),
    player: computed(() => ({ id: 'p1', camps: [], heroes: all(), openAdventure: open() })),
    adventure: open,
    settled: signal(null),
    busy: signal(false),
    error: signal<string | null>(null),
    started: [] as { location: string; jobId: string; heroIds: readonly string[] }[],
    startAdventure: async (location: string, jobId: string, heroIds: readonly string[]) => {
      fake.started.push({ location, jobId, heroIds });
      const result = answer(heroIds);
      if (result instanceof ApiError) throw result;
      open.set(result);
      return result;
    },
    all,
  };
  return fake;
}

function adventureOf(heroIds: readonly string[]): AdventureView {
  return {
    id: 'a1',
    startedAt: '2026-10-22T07:00:00.000Z',
    location: 'millbrook',
    seed: 's1',
    version: 'v1',
    job: { id: 'wolves-on-the-mill-road', name: 'Wolves on the mill road', description: 'Two wolves have been at the carts.' },
    snapshot: {
      version: 'v1',
      jobId: 'wolves-on-the-mill-road',
      heroes: party
        .filter((h) => heroIds.includes(h.id))
        .map((h) => ({ heroId: h.id, name: h.name, unitType: h.unitType, spriteSet: h.spriteSet, level: h.level, stats: { maxHealth: 30, speed: 8, damage: 4, gathering: 4 } })),
    },
  };
}

async function render(game: ReturnType<typeof fakeGame>, url: string) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes),
      { provide: Game, useValue: game },
      { provide: Session, useValue: { user: signal({ email: 'player@example.com', name: null, accessToken: 't' }) } },
      // The adventure's frames never come, so a run stays at its start.
      { provide: FRAME_LOOP, useValue: () => () => undefined },
      { provide: BATTLE_SCENE_FACTORY, useValue: async () => Promise.reject(new Error('no WebGL in jsdom')) },
      {
        provide: CAMP_SCENE_FACTORY,
        useValue: async () => ({ setHeroes: () => undefined, destroy: () => undefined }),
      },
    ],
  });
  const harness = await RouterTestingHarness.create(url);
  const router = TestBed.inject(Router);
  const settle = async () => {
    harness.detectChanges();
    await harness.fixture.whenStable();
  };
  await settle();
  return { harness, router, settle, page: harness.routeNativeElement as HTMLElement };
}

const current = (page: HTMLElement) => page.querySelector('nav.menu a[aria-current="page"]')?.textContent?.trim();
const boxes = (page: HTMLElement) => [...page.querySelectorAll<HTMLInputElement>('.party input[type="checkbox"]')];
const depart = (page: HTMLElement) => [...page.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Depart');

describe('Job board', () => {
  it("lists the board's jobs, easiest first, with what each brings home, each linked to its detail", async () => {
    const { page } = await render(fakeGame([]), '/camp/millbrook/job-board');
    expect(page.querySelector('aside h2')?.textContent).toBe('Job board');
    const jobs = [...page.querySelectorAll('.jobs li')].map((li) => [...li.children].map((c) => c.textContent?.trim()));
    expect(jobs).toEqual([
      ['Pick up sticks', 'up to 40 timber'],
      ['Timber from the near woods', '3 cloth and up to 60 timber'],
      ['Wolves on the mill road', '10 cloth'],
    ]);
    expect(page.querySelector('.jobs a')?.getAttribute('href')).toBe('/camp/millbrook/job-board/jobs/pick-up-sticks');
    expect(current(page)).toBe('Job board');
  });

  it("shows a job's stages in order, its credits beside the camp's balance and room, and its retreat penalty", async () => {
    const { page } = await render(fakeGame([party[0]!]), '/camp/millbrook/job-board/jobs/timber-from-the-near-woods');
    expect(page.querySelector('aside h2')?.textContent).toBe('Timber from the near woods');
    expect([...page.querySelectorAll('.stages li')].map((li) => li.textContent?.trim())).toEqual([
      'Travel',
      'Gather timber from 3 trees, up to 60',
      'Fight a wolf',
      'Arrive',
    ]);
    expect([...page.querySelectorAll('.credits li')].map((li) => li.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      '3 cloth. Millbrook holds 0, with room for 100 more.',
      'Up to 60 timber. Millbrook holds 90, with room for 10 more.',
      '15 XP to each hero who comes back.',
    ]);
    expect(page.querySelector('.retreat')?.textContent).toBe('A retreat forfeits the pay, keeps the timber gathered, and earns half the XP.');
    expect(current(page)).toBe('Job board');
    expect(page.querySelector('aside .back')?.getAttribute('href')).toBe('/camp/millbrook/job-board');
  });

  it('picks one to four living heroes, never the dead, and Departs only with one picked', async () => {
    const { page, settle } = await render(fakeGame([...party, hero('h6', 'Rook', 'DEAD')]), '/camp/millbrook/job-board/jobs/wolves-on-the-mill-road');
    expect(page.querySelector('.party')?.textContent).not.toContain('Rook');
    expect(boxes(page)).toHaveLength(5);
    expect(depart(page)?.disabled).toBe(true);

    for (const box of boxes(page).slice(0, 4)) box.click();
    await settle();
    expect(depart(page)?.disabled).toBe(false);
    expect(boxes(page).map((b) => b.disabled)).toEqual([false, false, false, false, true]);

    boxes(page)[0]!.click();
    await settle();
    expect(boxes(page).map((b) => b.disabled)).toEqual([false, false, false, false, false]);
  });

  it('Departs through startAdventure and goes to the adventure, which shows the job and the party', async () => {
    const game = fakeGame(party);
    const { harness, page, router, settle } = await render(game, '/camp/millbrook/job-board/jobs/wolves-on-the-mill-road');
    boxes(page)[0]!.click();
    boxes(page)[2]!.click();
    await settle();
    depart(page)!.click();
    await vi.waitFor(() => expect(router.url).toBe('/adventure'));
    expect(game.started).toEqual([{ location: 'millbrook', jobId: 'wolves-on-the-mill-road', heroIds: ['h1', 'h3'] }]);

    await settle();
    const shown = harness.routeNativeElement as HTMLElement;
    expect(shown.querySelector('aside h2')?.textContent).toBe('Wolves on the mill road');
    // The run starts once the scene has loaded, or failed to as it does in jsdom.
    await vi.waitFor(async () => {
      await settle();
      expect([...shown.querySelectorAll('.party strong')].map((s) => s.textContent)).toEqual(['Wren', 'Lark']);
    });
  });

  it("shows a start's refusal in place, in the player's words", async () => {
    const game = fakeGame(party, () => new ApiError('hero h1 is dead', 'HERO_DEAD'));
    const { page, router, settle } = await render(game, '/camp/millbrook/job-board/jobs/wolves-on-the-mill-road');
    boxes(page)[0]!.click();
    await settle();
    depart(page)!.click();
    await vi.waitFor(() => expect(game.started).toHaveLength(1));
    await settle();
    expect(page.querySelector('.refusal')?.textContent).toBe('A hero in the party is dead.');
    expect(page.querySelector('.refusal')?.getAttribute('role')).toBe('alert');
    expect(router.url).toBe('/camp/millbrook/job-board/jobs/wolves-on-the-mill-road');
  });

  it("shows a refusal it has no words for as the hub put it", async () => {
    const game = fakeGame(party, () => new ApiError('something new', 'SOMETHING_NEW'));
    const { page, settle } = await render(game, '/camp/millbrook/job-board/jobs/wolves-on-the-mill-road');
    boxes(page)[0]!.click();
    await settle();
    depart(page)!.click();
    await vi.waitFor(() => expect(game.started).toHaveLength(1));
    await settle();
    expect(page.querySelector('.refusal')?.textContent).toBe('something new');
  });

  it('sends a camp with no living hero to the hall', async () => {
    const { page } = await render(fakeGame([hero('h6', 'Rook', 'DEAD')]), '/camp/millbrook/job-board/jobs/wolves-on-the-mill-road');
    expect(boxes(page)).toHaveLength(0);
    expect(depart(page)).toBeUndefined();
    expect(page.querySelector('aside')?.textContent).toContain('No hero here is alive.');
    expect([...page.querySelectorAll('aside a')].some((a) => a.getAttribute('href') === '/camp/millbrook/heroes-hall')).toBe(true);
  });

  it('leads to the open adventure from the job, the board and the menu, instead of offering Depart', async () => {
    const game = fakeGame(party);
    game.adventure.set(adventureOf(['h1']));
    const { page } = await render(game, '/camp/millbrook/job-board/jobs/timber-from-the-near-woods');
    expect(depart(page)).toBeUndefined();
    expect(page.querySelector('aside .note a')?.getAttribute('href')).toBe('/adventure');
    const entry = [...page.querySelectorAll('nav.menu a')].find((a) => a.textContent?.trim() === 'Adventure');
    expect(entry?.getAttribute('href')).toBe('/adventure');
    expect(entry?.querySelector('img')?.getAttribute('src')).toBe('art/icons/adventure.png');
  });

  it('has no adventure entry in the menu while none is open', async () => {
    const { page } = await render(fakeGame(party), '/camp/millbrook/job-board');
    expect([...page.querySelectorAll('nav.menu a')].map((a) => a.textContent?.trim())).not.toContain('Adventure');
  });

  it('says so for a job the board does not post', async () => {
    const { page } = await render(fakeGame(party), '/camp/millbrook/job-board/jobs/nothing');
    expect(page.querySelector('aside')?.textContent).toContain('The job board has no such job.');
  });

  it('sends /adventure to the camp when no adventure is open', async () => {
    const { router } = await render(fakeGame(party), '/adventure');
    await vi.waitFor(() => expect(router.url).toBe('/camp/millbrook/heroes-hall'));
  });
});
