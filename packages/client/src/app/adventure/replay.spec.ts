import { signal } from '@angular/core';
import { screen, waitFor, within } from '@testing-library/angular/zoneless';

import { type AdventureEvent, type AdventureSnapshot, must, replay, UNIT_PROFILES } from '@heat/engine';

import { Game, type ReplayedView } from '../game';
import { ApiError } from '../hub';
import { Blank } from '../testing/blank';
import { testLayoutSizes } from '../testing/layout-sizes';
import { listItems } from '../testing/page';
import { renderAt } from '../testing/render-at';
import { textsOf } from '../testing/texts-of';
import { BATTLE_SCENE_FACTORY, FRAME_LOOP } from './battle-view';
import type { BattleSceneCallbacks } from './battle/battle-scene';
import type { Field } from './field';
import { Replay } from './replay';

const snapshot = {
  version: 'v1',
  jobId: 'timber-from-the-near-woods',
  heroes: [
    { heroId: 'x1', name: 'Bram', unitType: 'fighter', spriteSet: 'fighter-02', level: 2, stats: must(UNIT_PROFILES.fighter, 'the fighter profile').stats },
    { heroId: 'x2', name: 'Tansy', unitType: 'villager', spriteSet: 'villager-01', level: 1, stats: must(UNIT_PROFILES.villager, 'the villager profile').stats },
  ],
};
const played = replay(snapshot as AdventureSnapshot, 'seed-9', []);

/** Another player's settled adventure as its replay page reads it: no owner, the result and the stored timeline. */
function settled(timeline: ReplayedView['timeline'] = played.timeline): ReplayedView {
  return {
    id: 'a9',
    location: 'millbrook',
    status: 'SETTLED',
    settledAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    job: { id: 'timber-from-the-near-woods', name: 'Timber from the near woods' },
    snapshot: { heroes: snapshot.heroes.map(({ heroId, name, unitType, level }) => ({ heroId, name, unitType, level })) },
    result: {
      outcome: 'complete',
      stages: [
        { stage: 0, kind: 'travel', ended: 'done' },
        { stage: 1, kind: 'gather', ended: 'win' },
        { stage: 2, kind: 'fight', ended: 'win' },
        { stage: 3, kind: 'arrive', ended: 'done' },
      ],
      rewards: [],
      credited: [],
      lost: [],
      heroes: [
        { heroId: 'x1', xpGained: 15, xp: 40, level: 3, dead: false },
        { heroId: 'x2', xpGained: 0, xp: 0, level: 1, dead: true },
      ],
    },
    timeline,
  };
}

/** A scene that draws nothing, records what it was given, and says everyone is on at once. */
function fakeScene() {
  const scene = {
    resets: [] as { field: Field; sets: ReadonlyMap<string, string> }[],
    fed: [] as AdventureEvent[],
    factory: (_host: HTMLElement, callbacks: BattleSceneCallbacks) =>
      Promise.resolve({
        reset: (field: Field, sets: ReadonlyMap<string, string>, enter: boolean) => {
          scene.resets.push({ field, sets });
          if (enter) callbacks.onEntered();
        },
        feed: (events: readonly AdventureEvent[]) => {
          scene.fed.push(...events);
          callbacks.onEntered();
        },
        frame: () => undefined,
        destroy: () => undefined,
      }),
  };
  return scene;
}

/** A game whose replay read answers as the test says, recording each id asked for. */
function fakeGame(answer: () => Promise<ReplayedView | null>) {
  const fake = {
    location: signal('millbrook'),
    reads: [] as string[],
    replay: (id: string) => {
      fake.reads.push(id);
      return answer();
    },
  };
  return fake;
}

async function renderReplay(game: ReturnType<typeof fakeGame>, scene = fakeScene()) {
  let onFrame: (ms: number) => void = () => undefined;
  const view = await renderAt(
    '/replays/a9',
    [
      { path: 'replays/:id', component: Replay },
      { path: 'camp/:location/job-board', component: Blank },
      { path: '', component: Blank },
    ],
    [
      { provide: Game, useValue: game },
      { provide: FRAME_LOOP, useValue: (f: (ms: number) => void) => ((onFrame = f), () => undefined) },
      { provide: BATTLE_SCENE_FACTORY, useValue: scene.factory },
      testLayoutSizes,
    ],
  );
  const run = async (ms: number) => {
    for (let left = ms; left > 0; left -= 250) onFrame(Math.min(250, left));
    await view.settle();
  };
  return { ...view, run };
}

const button = (name: string) => screen.getByRole('button', { name });
const panel = () => within(screen.getByRole('complementary', { name: /./ }));

describe('Replay page (Issue-290)', () => {
  it('plays the stored timeline in the scene as soon as it is read, beside the job, where, when, how it ended, its stages and its party', async () => {
    const scene = fakeScene();
    const game = fakeGame(() => Promise.resolve(settled()));
    const { run } = await renderReplay(game, scene);
    await waitFor(() => { expect(scene.resets).toHaveLength(1); });
    expect(game.reads).toEqual(['a9']);
    expect(scene.resets[0]?.field).toMatchObject({ stage: 0, outcome: null });
    expect(scene.resets[0]?.sets).toEqual(new Map([['x1', 'fighter-02'], ['x2', 'villager-01']]));

    expect(panel().getByRole('heading', { name: 'Timber from the near woods', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('complementary')).toHaveAccessibleName('Timber from the near woods');
    expect(panel().getByText('Replay. At Millbrook, 2 hours ago.')).toBeInTheDocument();
    expect(panel().getByText('Job done.')).toBeInTheDocument();
    expect(textsOf(listItems('Stages'))).toEqual(['travel: done', 'gather: won', 'fight: won', 'arrive: done']);
    expect(panel().getByText('Bram (fighter, level 3), Tansy (villager, level 1, died).')).toBeInTheDocument();
    expect(panel().getByRole('link', { name: 'Back to Millbrook' })).toHaveAttribute('href', '/camp/millbrook/job-board');

    const before = scene.fed.length;
    await run(10_000);
    expect(scene.fed.length).toBeGreaterThan(before);
    // No engine runs and nothing can be told to the heroes: a replay is display only.
    expect(screen.queryByRole('group', { name: /next action$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Party orders' })).not.toBeInTheDocument();
  });

  it("has the player's own replay's pause and speeds, and plays again from the start", async () => {
    const scene = fakeScene();
    const { run, user } = await renderReplay(fakeGame(() => Promise.resolve(settled())), scene);
    await waitFor(() => { expect(scene.resets).toHaveLength(1); });
    const playback = within(screen.getByRole('group', { name: 'Playback' }));
    expect(textsOf(playback.getAllByRole('button'))).toEqual(['Pause', '1×', '2×', '4×']);

    await user.click(playback.getByRole('button', { name: '4×' }));
    expect(playback.getByRole('button', { name: '4×' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(playback.getByRole('button', { name: 'Pause' }));
    const paused = scene.fed.length;
    await run(10_000);
    expect(scene.fed).toHaveLength(paused);
    expect(playback.getByRole('button', { name: 'Resume' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(button('Watch from the start'));
    await waitFor(() => { expect(scene.resets).toHaveLength(2); });
    expect(scene.resets[1]?.field).toMatchObject({ stage: 0, outcome: null });
  });

  it('shows the health of each hero as the replay plays', async () => {
    const scene = fakeScene();
    await renderReplay(fakeGame(() => Promise.resolve(settled())), scene);
    await waitFor(() => { expect(scene.resets).toHaveLength(1); });
    expect(await screen.findByRole('meter', { name: 'Bram health' })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Tansy health' })).toBeInTheDocument();
  });

  it('says Loading until the read answers', async () => {
    let answer: (replayed: ReplayedView) => void = () => undefined;
    // The page is not stable while the read is under way, so the render is waited for after it answers.
    const view = renderReplay(fakeGame(() => new Promise((resolve) => { answer = resolve; })));
    expect(await screen.findByText('Loading…')).toBeInTheDocument();
    expect(panel().getByRole('heading', { name: 'Replay', level: 2 })).toBeInTheDocument();
    answer(settled());
    await view;
    expect(await panel().findByRole('heading', { name: 'Timber from the near woods', level: 2 })).toBeInTheDocument();
  });

  it('says a replay stored before the battles changed is unavailable, and plays none of it, with the rest of the page', async () => {
    const scene = fakeScene();
    const old = { ...played.timeline, schemaVersion: played.timeline.schemaVersion - 1 };
    await renderReplay(fakeGame(() => Promise.resolve(settled(old))), scene);
    expect(await screen.findByText('Replay unavailable: this adventure was played before the battles changed.')).toHaveRole('alert');
    expect(panel().getByText('Job done.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Playback' })).not.toBeInTheDocument();
    expect(scene.resets).toHaveLength(0);
  });

  it('says there is no such replay for an id the hub answers none for', async () => {
    await renderReplay(fakeGame(() => Promise.resolve(null)));
    expect(await panel().findByText('No such replay.')).toBeInTheDocument();
    expect(panel().getByRole('link', { name: 'Back to camp' })).toHaveAttribute('href', '/');
  });

  it("says there is no such replay for the player's own adventure still open, which has no timeline to play", async () => {
    await renderReplay(fakeGame(() => Promise.resolve({ ...settled(null), status: 'OPEN', settledAt: null, result: null })));
    expect(await panel().findByText('No such replay.')).toBeInTheDocument();
  });

  it('says so, as an alert, when the replay could not be read', async () => {
    await renderReplay(fakeGame(() => Promise.reject(new ApiError('the hub answered 502', null))));
    expect(await panel().findByText('The replay could not be read.')).toHaveRole('alert');
    expect(panel().getByRole('link', { name: 'Back to camp' })).toBeInTheDocument();
  });
});
