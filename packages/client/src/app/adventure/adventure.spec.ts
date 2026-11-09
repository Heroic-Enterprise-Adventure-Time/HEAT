import { computed, signal } from '@angular/core';
import { screen, waitFor, within } from '@testing-library/angular/zoneless';

import { type AdventureEvent, type AdventureLogEntry, type AdventureSnapshot, must, replay, UNIT_PROFILES } from '@heat/engine';

import { type AdventureResultView, type AdventureView, Game, type SettledView } from '../game';
import { ApiError } from '../hub';
import { Blank } from '../testing/blank';
import { testLayoutSizes } from '../testing/layout-sizes';
import { itemHolding, listItems } from '../testing/page';
import { renderAt } from '../testing/render-at';
import { textsOf } from '../testing/texts-of';
import { Adventure, BATTLE_SCENE_FACTORY, FRAME_LOOP } from './adventure';
import type { BattleSceneCallbacks } from './battle/battle-scene';
import { type Field, isEntry } from './field';
import { AdventureRun, loadRun, saveRun } from './run';

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

async function renderAdventure(game: ReturnType<typeof fakeGame>, scene = fakeScene()) {
  let onFrame: (ms: number) => void = () => undefined;
  const { router, settle, user } = await renderAt(
    '/adventure',
    [
      { path: 'adventure', component: Adventure },
      { path: 'camp/:location', component: Blank },
    ],
    [
      { provide: Game, useValue: game },
      { provide: FRAME_LOOP, useValue: (f: (ms: number) => void) => ((onFrame = f), () => undefined) },
      { provide: BATTLE_SCENE_FACTORY, useValue: scene.factory },
      testLayoutSizes,
    ],
  );
  // The scene loads after the first render; the run starts once it has.
  await waitFor(() => { expect(scene.resets.length).toBeGreaterThan(0); });
  await settle();
  /** Runs `ms` of wall-clock time in frames of at most 250 ms, as the browser would. */
  const run = async (ms: number) => {
    for (let left = ms; left > 0; left -= 250) onFrame(Math.min(250, left));
    await settle();
  };
  return { run, router, user };
}

const button = (name: string) => screen.getByRole('button', { name });
/** What a hero may do next: the group of its ability buttons. */
const abilities = (hero: string) => within(screen.getByRole('group', { name: `${hero} next action` }));
/** A hero's item in the party, which holds what it will do next. */
const heroItem = (hero: string) => within(itemHolding('Party', 'group', `${hero} next action`));
const stage = (text: string | RegExp) => screen.getByText(text);

describe('Adventure', () => {
  beforeEach(() => { localStorage.clear(); });

  it("shows the job, the stage under way and each hero's abilities, usable only in a fight or a gather", async () => {
    const { run } = await renderAdventure(fakeGame());
    expect(screen.getByRole('heading', { name: 'Timber from the near woods', level: 2 })).toBeInTheDocument();
    expect(stage('Stage 1 of 4: Travel')).toBeInTheDocument();
    expect(textsOf(abilities('Wren').getAllByRole('button'))).toEqual(['Strike', 'Chop', 'Mine', 'Move up']);
    expect(textsOf(abilities('Wat').getAllByRole('button'))).toEqual(['Guard', 'Strike']);
    expect(abilities('Wren').getByRole('button', { name: 'Chop' })).toBeDisabled();
    // The reason is beside the disabled buttons, and each hero's group is described by it.
    const wait = 'On the road: abilities are for a fight or a gather.';
    expect(screen.getByText(wait)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Wren next action' })).toHaveAccessibleDescription(wait);

    await run(4100);
    expect(stage('Stage 2 of 4: Gather timber from 3 trees, up to 60')).toBeInTheDocument();
    expect(abilities('Wren').getByRole('button', { name: 'Chop' })).toBeEnabled();
    expect(screen.queryByText(wait)).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Wren next action' })).not.toHaveAccessibleDescription();
  });

  it("queues a forced action until the hero's turn uses it, and logs it then", async () => {
    const { run, user } = await renderAdventure(fakeGame());
    // By 7 s the villager has stepped up to the front line, where the trees are in reach.
    await run(7000);
    await user.click(abilities('Wren').getByRole('button', { name: 'Chop' }));
    expect(await heroItem('Wren').findByText('Next: Chop')).toBeInTheDocument();
    expect(abilities('Wren').getByRole('button', { name: 'Chop' })).toHaveAttribute('aria-pressed', 'true');
    await run(3000);
    expect(heroItem('Wren').queryByText(/^Next:/)).not.toBeInTheDocument();
    expect(loadRun('a1')?.log).toEqual([
      { kind: 'unit', acceptedAtSimTime: expect.any(Number) as number, unitId: 'h2', override: { kind: 'force-action', abilityId: 'chop' } },
    ]);
  });

  it('drops a forced action its hero cannot use at its turn, and logs nothing', async () => {
    const { run, user } = await renderAdventure(fakeGame());
    await run(4100);
    // No ore vein in the near woods.
    await user.click(abilities('Wren').getByRole('button', { name: 'Mine' }));
    expect(await heroItem('Wren').findByText('Next: Mine')).toBeInTheDocument();
    await run(3000);
    expect(heroItem('Wren').queryByText(/^Next:/)).not.toBeInTheDocument();
    expect(loadRun('a1')?.log).toEqual([]);
  });

  it('pauses, and runs at the speed picked', async () => {
    const { run, user } = await renderAdventure(fakeGame());
    await user.click(button('Pause'));
    await run(1000);
    expect(stage('Stage 1 of 4: Travel')).toBeInTheDocument();
    await user.click(button('Resume'));
    await user.click(button('4×'));
    await waitFor(() => { expect(button('4×')).toHaveAttribute('aria-pressed', 'true'); });
    await run(1100);
    expect(stage(/^Stage 2 of 4/)).toBeInTheDocument();
  });

  it('orders a retreat, which stays selected, and the run ends with it in the log', async () => {
    const game = fakeGame();
    const { run, user } = await renderAdventure(game);
    await run(4100);
    await user.click(button('Retreat'));
    await waitFor(() => { expect(button('Retreat')).toHaveAttribute('aria-pressed', 'true'); });
    expect(button('Press on')).toHaveAttribute('aria-pressed', 'false');
    await run(60_000);
    expect(game.submitted).toHaveLength(1);
    expect(game.submitted[0]?.some((e) => e.kind === 'party' && e.order === 'retreat')).toBe(true);
  });

  it('holds the clock at an entry until the scene has brought everyone on', async () => {
    const scene = fakeScene(true);
    const { run } = await renderAdventure(fakeGame(), scene);
    expect(scene.resets).toMatchObject([{ field: { stage: 0 }, enter: true }]);
    await run(2000);
    expect(scene.fed).toEqual([]);
    scene.release();
    await run(4100);
    expect(stage(/^Stage 2 of 4/)).toBeInTheDocument();
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
    await renderAdventure(fakeGame(), scene);
    expect(screen.getByText('Picked up where you left off.')).toBeInTheDocument();
    // Picked up, everyone stands where they were: nobody runs on.
    expect(scene.resets.map((r) => r.enter)).toEqual([false]);
    expect(stage(/^Stage 2 of 4/)).toBeInTheDocument();
  });

  it("submits the log at the end, shows the result in the player's words, and goes back to camp", async () => {
    const game = fakeGame();
    const { run, router, user } = await renderAdventure(game);
    await run(120_000);
    expect(game.submitted).toHaveLength(1);
    expect(loadRun('a1')).toBeNull();
    expect(await screen.findByText('Job done.')).toBeInTheDocument();
    expect(textsOf(listItems('Stages'))).toEqual(['travel: done', 'gather: won', 'fight: won', 'arrive: done']);
    expect(textsOf(listItems('Rewards'))).toEqual(['60 timber', '3 cloth']);
    expect(screen.getByText('10 timber lost: the warehouse was full.')).toBeInTheDocument();
    expect(screen.queryByText(/cloth lost/)).not.toBeInTheDocument();
    expect(textsOf(listItems('Heroes'))).toEqual(['Wat +15 XP, level 2 level up', 'Wren died']);

    await user.click(button('Back to Millbrook'));
    await waitFor(() => { expect(router.url).toBe('/camp/millbrook'); });
    expect(game.settled()).toBeNull();
  });

  it('replays the stored timeline in the scene from its start, and goes back to the result', async () => {
    const scene = fakeScene();
    const game = fakeGame();
    const { run, user } = await renderAdventure(game, scene);
    await run(120_000);
    await user.click(await screen.findByRole('button', { name: 'Watch the replay' }));
    await waitFor(() => { expect(scene.resets).toHaveLength(2); });
    expect(game.timelines).toEqual(['a1']);
    expect(scene.resets[1]).toMatchObject({ field: { stage: 0, outcome: null }, enter: true });
    expect(await screen.findByText('Replay')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /next action$/ })).not.toBeInTheDocument();
    const before = scene.fed.length;
    await run(10_000);
    expect(scene.fed.length).toBeGreaterThan(before);
    expect(game.submitted).toHaveLength(1);

    await user.click(button('Back to the result'));
    expect(await screen.findByText('Job done.')).toBeInTheDocument();
  });

  it('says so when the adventure was lost to a game update', async () => {
    const { run } = await renderAdventure(fakeGame(() => null));
    await run(120_000);
    expect(await screen.findByText('This adventure was lost to a game update. The party came home with nothing.')).toHaveRole('alert');
    expect(button('Back to Millbrook')).toBeInTheDocument();
  });

  it('keeps the log and offers to try again when the hub cannot be reached', async () => {
    let failing = true;
    const game = fakeGame(() => (failing ? new ApiError('the hub answered 502', null) : result));
    const { run, user } = await renderAdventure(game);
    await run(120_000);
    expect(await screen.findByText('The run could not be sent: the hub answered 502')).toHaveRole('alert');
    expect(loadRun('a1')).not.toBeNull();

    failing = false;
    await user.click(button('Try again'));
    expect(await screen.findByText('Job done.')).toBeInTheDocument();
    expect(game.submitted).toHaveLength(2);
    expect(game.submitted[1]).toEqual(game.submitted[0]);
  });
});
