import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { UNIT_PROFILES, replay, must, type AdventureEvent, type AdventureLogEntry, type AdventureSnapshot } from '@heat/engine';
import { ApiError } from '../hub';
import { Game, type AdventureResultView, type AdventureView, type SettledView } from '../game';
import { Adventure, BATTLE_SCENE_FACTORY, FRAME_LOOP } from './adventure';
import { LAYOUT_SIZES } from '../camp/layout-sizes';
import { TEST_LAYOUT_SIZES } from '../testing/layout-sizes';
import type { BattleSceneCallbacks } from './battle/battle-scene';
import { isEntry, type Field } from './field';
import { AdventureRun, loadRun, saveRun } from './run';
import { Blank } from '../testing/blank';

const adventure: AdventureView = {
  id: 'a1',
  startedAt: '2026-10-22T07:00:00.000Z',
  location: 'millbrook',
  seed: 'seed-1',
  version: 'v1',
  job: { id: 'timber-from-the-near-woods', name: 'Timber from the near woods', description: 'Fell what you can carry.' },
  snapshot: {
    version: 'v1',
    jobId: 'timber-from-the-near-woods',
    heroes: [
      { heroId: 'h1', name: 'Wat', unitType: 'fighter', spriteSet: 'fighter-02', level: 1, stats: must(UNIT_PROFILES.fighter, 'the fighter profile').stats },
      { heroId: 'h2', name: 'Wren', unitType: 'villager', spriteSet: 'villager-01', level: 1, stats: must(UNIT_PROFILES.villager, 'the villager profile').stats },
    ],
  },
};

const result: AdventureResultView = {
  outcome: 'complete',
  stages: [
    { stage: 0, kind: 'travel', ended: 'done' },
    { stage: 1, kind: 'gather', ended: 'win' },
    { stage: 2, kind: 'fight', ended: 'win' },
    { stage: 3, kind: 'arrive', ended: 'done' },
  ],
  rewards: [
    { material: 'timber', amount: 60 },
    { material: 'cloth', amount: 3 },
  ],
  credited: [
    { material: 'timber', amount: 50 },
    { material: 'cloth', amount: 3 },
  ],
  lost: [
    { material: 'timber', amount: 10 },
    { material: 'cloth', amount: 0 },
  ],
  heroes: [
    { heroId: 'h1', xpGained: 15, xp: 15, level: 2, dead: false },
    { heroId: 'h2', xpGained: 0, xp: 0, level: 1, dead: true },
  ],
};

/**
 * A scene that draws nothing and records what it was given. By default it
 * says everyone is on at once, as if the rush in took no time; `holding`
 * keeps an entry waiting until the test calls `release`.
 */
function fakeScene(holding = false) {
  let callbacks: BattleSceneCallbacks | null = null;
  const scene = {
    resets: [] as { field: Field; enter: boolean }[],
    fed: [] as AdventureEvent[],
    frames: 0,
    release: () => callbacks?.onEntered(),
    factory: (_host: HTMLElement, given: BattleSceneCallbacks) => {
      callbacks = given;
      return Promise.resolve({
        reset: (field: Field, _sets: ReadonlyMap<string, string>, enter: boolean) => {
          scene.resets.push({ field, enter });
          if (enter && !holding) given.onEntered();
        },
        feed: (events: readonly AdventureEvent[]) => {
          scene.fed.push(...events);
          if (events.some(isEntry) && !holding) given.onEntered();
        },
        frame: () => {
          scene.frames++;
        },
        destroy: () => undefined,
      });
    },
  };
  return scene;
}

/** A game with the open adventure and a submit that answers as the test says, recording each log it was given. */
function fakeGame(answer: () => AdventureResultView | null | Error = () => result) {
  const open = signal<AdventureView | null>(adventure);
  const settled = signal<SettledView | null>(null);
  const fake = {
    location: signal('millbrook'),
    player: computed(() => ({ id: 'p1', camps: [], heroes: [], openAdventure: open() })),
    adventure: open,
    settled,
    submitted: [] as (readonly AdventureLogEntry[])[],
    timelines: [] as string[],
    timeline: (id: string) => {
      fake.timelines.push(id);
      return Promise.resolve(replay(adventure.snapshot as AdventureSnapshot, adventure.seed, []).timeline);
    },
    submitAdventure: (submittedAdventure: AdventureView, log: readonly AdventureLogEntry[]) => {
      fake.submitted.push([...log]);
      const answered = answer();
      if (answered instanceof Error) return Promise.reject(answered);
      settled.set({ adventure: submittedAdventure, result: answered });
      open.set(null);
      return Promise.resolve();
    },
  };
  return fake;
}

async function render(game: ReturnType<typeof fakeGame>, scene = fakeScene()) {
  let onFrame: (ms: number) => void = () => undefined;
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'adventure', component: Adventure },
        { path: 'camp/:location', component: Blank },
      ]),
      { provide: Game, useValue: game },
      { provide: FRAME_LOOP, useValue: (f: (ms: number) => void) => ((onFrame = f), () => undefined) },
      { provide: BATTLE_SCENE_FACTORY, useValue: scene.factory },
      { provide: LAYOUT_SIZES, useValue: () => TEST_LAYOUT_SIZES },
    ],
  });
  const harness = await RouterTestingHarness.create('/adventure');
  const settle = async () => {
    harness.detectChanges();
    await harness.fixture.whenStable();
  };
  await settle();
  // The scene loads after the first render; the run starts once it has.
  await vi.waitFor(() => { expect(scene.resets.length).toBeGreaterThan(0); });
  await settle();
  const page = harness.routeNativeElement as HTMLElement;
  /** Runs `ms` of wall-clock time in frames of at most 250 ms, as the browser would. */
  const run = async (ms: number) => {
    for (let left = ms; left > 0; left -= 250) onFrame(Math.min(250, left));
    await settle();
  };
  return { harness, page, settle, run, scene, router: TestBed.inject(Router) };
}

const button = (page: HTMLElement, text: string, within = page) =>
  must([...within.querySelectorAll('button')].find((b) => b.textContent.trim() === text), `the ${text} button`);
const heroItem = (page: HTMLElement, name: string) =>
  must([...page.querySelectorAll<HTMLElement>('.party li')].find((li) => li.querySelector('strong')?.textContent === name), `the party item of ${name}`);

describe('Adventure', () => {
  beforeEach(() => { localStorage.clear(); });

  it("shows the job, the stage under way and each hero's abilities, usable only in a fight or a gather", async () => {
    const { page, run } = await render(fakeGame());
    expect(page.querySelector('aside h2')?.textContent).toBe('Timber from the near woods');
    expect(page.querySelector('.stage-name')?.textContent).toBe('Stage 1 of 4: Travel');
    expect([...heroItem(page, 'Wren').querySelectorAll('.abilities button')].map((b) => b.textContent.trim())).toEqual([
      'Strike',
      'Chop',
      'Mine',
      'Move up',
    ]);
    expect([...heroItem(page, 'Wat').querySelectorAll('.abilities button')].map((b) => b.textContent.trim())).toEqual(['Guard', 'Strike']);
    expect(button(page, 'Chop', heroItem(page, 'Wren')).disabled).toBe(true);

    await run(4100);
    expect(page.querySelector('.stage-name')?.textContent).toBe('Stage 2 of 4: Gather timber from 3 trees, up to 60');
    expect(button(page, 'Chop', heroItem(page, 'Wren')).disabled).toBe(false);
  });

  it("queues a forced action until the hero's turn uses it, and logs it then", async () => {
    const game = fakeGame();
    const { page, run, settle } = await render(game);
    // By 7 s the villager has stepped up to the front line, where the trees are in reach.
    await run(7000);
    button(page, 'Chop', heroItem(page, 'Wren')).click();
    await settle();
    expect(button(page, 'Chop', heroItem(page, 'Wren')).getAttribute('aria-pressed')).toBe('true');
    expect(heroItem(page, 'Wren').querySelector('.queued')?.textContent).toBe('Next: Chop');
    await run(3000);
    expect(heroItem(page, 'Wren').querySelector('.queued')).toBeNull();
    expect(loadRun('a1')?.log).toEqual([
      { kind: 'unit', acceptedAtSimTime: expect.any(Number) as number, unitId: 'h2', override: { kind: 'force-action', abilityId: 'chop' } },
    ]);
  });

  it('drops a forced action its hero cannot use at its turn, and logs nothing', async () => {
    const { page, run, settle } = await render(fakeGame());
    await run(4100);
    // No ore vein in the near woods.
    button(page, 'Mine', heroItem(page, 'Wren')).click();
    await settle();
    await run(3000);
    expect(heroItem(page, 'Wren').querySelector('.queued')).toBeNull();
    expect(loadRun('a1')?.log).toEqual([]);
  });

  it('pauses, and runs at the speed picked', async () => {
    const { page, run, settle } = await render(fakeGame());
    button(page, 'Pause').click();
    await run(1000);
    expect(page.querySelector('.stage-name')?.textContent).toBe('Stage 1 of 4: Travel');
    button(page, 'Resume').click();
    button(page, '4×').click();
    await settle();
    expect(button(page, '4×').getAttribute('aria-pressed')).toBe('true');
    await run(1100);
    expect(page.querySelector('.stage-name')?.textContent).toContain('Stage 2 of 4');
  });

  it('orders a retreat, which stays selected, and the run ends with it in the log', async () => {
    const game = fakeGame();
    const { page, run, settle } = await render(game);
    await run(4100);
    button(page, 'Retreat').click();
    await settle();
    expect(button(page, 'Retreat').getAttribute('aria-pressed')).toBe('true');
    expect(button(page, 'Press on').getAttribute('aria-pressed')).toBe('false');
    await run(60_000);
    expect(game.submitted).toHaveLength(1);
    expect(game.submitted[0]?.some((e) => e.kind === 'party' && e.order === 'retreat')).toBe(true);
  });

  it('holds the clock at an entry until the scene has brought everyone on', async () => {
    const scene = fakeScene(true);
    const { page, run } = await render(fakeGame(), scene);
    expect(scene.resets).toMatchObject([{ field: { stage: 0 }, enter: true }]);
    await run(2000);
    expect(scene.fed).toEqual([]);
    scene.release();
    await run(4100);
    expect(page.querySelector('.stage-name')?.textContent).toContain('Stage 2 of 4');
    expect(scene.fed.filter((e) => e.kind === 'battle-start')).toHaveLength(1);
    // The fight's clock waits for the trees and their road to come on: nothing more happens until then.
    const fed = scene.fed.length;
    await run(3000);
    expect(scene.fed).toHaveLength(fed);
    scene.release();
    await run(3000);
    expect(scene.fed.length).toBeGreaterThan(fed);
    expect(scene.frames).toBeGreaterThan(0);
  });

  it('resumes from the log saved in the browser, at the time it reached', async () => {
    const earlier = new AdventureRun(adventure.snapshot as AdventureSnapshot, adventure.seed);
    earlier.advanceTo(8000);
    saveRun('a1', { log: earlier.log, simTime: earlier.simTime });
    const scene = fakeScene();
    const { page } = await render(fakeGame(), scene);
    expect(page.querySelector('.note')?.textContent).toBe('Picked up where you left off.');
    // Picked up, everyone stands where they were: nobody runs on.
    expect(scene.resets.map((r) => r.enter)).toEqual([false]);
    expect(page.querySelector('.stage-name')?.textContent).toContain('Stage 2 of 4');
  });

  it("submits the log at the end, shows the result in the player's words, and goes back to camp", async () => {
    const game = fakeGame();
    const { page, run, router, settle } = await render(game);
    await run(120_000);
    expect(game.submitted).toHaveLength(1);
    expect(loadRun('a1')).toBeNull();
    expect(page.querySelector('.outcome')?.textContent).toBe('Job done.');
    expect([...page.querySelectorAll('.stages li')].map((li) => li.textContent.trim())).toEqual([
      'travel: done',
      'gather: won',
      'fight: won',
      'arrive: done',
    ]);
    expect([...page.querySelectorAll('.rewards li')].map((li) => li.textContent.trim())).toEqual(['60 timber', '3 cloth']);
    expect([...page.querySelectorAll('p.lost')].map((p) => p.textContent.trim())).toEqual(['10 timber lost: the warehouse was full.']);
    expect([...page.querySelectorAll('.heroes li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim())).toEqual([
      'Wat +15 XP, level 2 level up',
      'Wren died',
    ]);

    button(page, 'Back to Millbrook').click();
    await vi.waitFor(() => { expect(router.url).toBe('/camp/millbrook'); });
    await settle();
    expect(game.settled()).toBeNull();
  });

  it('replays the stored timeline in the scene from its start, and goes back to the result', async () => {
    const scene = fakeScene();
    const game = fakeGame();
    const { page, run, settle } = await render(game, scene);
    await run(120_000);
    button(page, 'Watch the replay').click();
    await vi.waitFor(() => { expect(scene.resets).toHaveLength(2); });
    await settle();
    expect(game.timelines).toEqual(['a1']);
    expect(scene.resets[1]).toMatchObject({ field: { stage: 0, outcome: null }, enter: true });
    expect(page.querySelector('.note')?.textContent).toBe('Replay');
    expect(page.querySelector('.abilities')).toBeNull();
    const before = scene.fed.length;
    await run(10_000);
    expect(scene.fed.length).toBeGreaterThan(before);
    expect(game.submitted).toHaveLength(1);

    button(page, 'Back to the result').click();
    await settle();
    expect(page.querySelector('.outcome')?.textContent).toBe('Job done.');
  });

  it('says so when the adventure was lost to a game update', async () => {
    const { page, run } = await render(fakeGame(() => null));
    await run(120_000);
    expect(page.querySelector('[role="alert"]')?.textContent).toBe('This adventure was lost to a game update. The party came home with nothing.');
    expect(button(page, 'Back to Millbrook')).toBeTruthy();
  });

  it('keeps the log and offers to try again when the hub cannot be reached', async () => {
    let failing = true;
    const game = fakeGame(() => (failing ? new ApiError('the hub answered 502', null) : result));
    const { page, run, settle } = await render(game);
    await run(120_000);
    await vi.waitFor(async () => {
      await settle();
      expect(page.querySelector('[role="alert"]')?.textContent).toBe('The run could not be sent: the hub answered 502');
    });
    expect(loadRun('a1')).not.toBeNull();

    failing = false;
    button(page, 'Try again').click();
    await vi.waitFor(() => { expect(game.submitted).toHaveLength(2); });
    await settle();
    expect(game.submitted[1]).toEqual(game.submitted[0]);
    expect(page.querySelector('.outcome')?.textContent).toBe('Job done.');
  });
});
