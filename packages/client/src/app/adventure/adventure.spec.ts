import { computed, signal } from '@angular/core';
import { screen, waitFor, within } from '@testing-library/angular/zoneless';
import { range } from 'es-toolkit';

import { type AdventureLogEntry, type AdventureSnapshot, must, replay, UNIT_PROFILES, type UnlockId, UNLOCKS } from '@heat/engine';

import { type AdventureResultView, type AdventureView, Game, type SettledView } from '../game';
import { ApiError } from '../hub';
import { Blank } from '../testing/blank';
import { fakeBattleScene, fakeFrameLoop, landsBlow, runToBlow } from '../testing/fake-battle';
import { testLayoutSizes } from '../testing/layout-sizes';
import { button, itemHolding, listItems } from '../testing/page';
import { renderAt } from '../testing/render-at';
import { textsOf, wordsOf } from '../testing/texts-of';
import { Adventure } from './adventure';
import { BATTLE_SCENE_FACTORY, FRAME_LOOP } from './battle-view';
import { isEntry } from './field';
import { AdventureRun, loadRun, saveRun } from './run';

const adventure: AdventureView = {
  id: 'a1',
  startedAt: '2026-10-22T07:00:00.000Z',
  location: 'millbrook',
  seed: 'seed-1',
  version: 'v1',
  caravan: null,
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
  delivered: [],
  deliveryLost: [],
  heroes: [
    { heroId: 'h1', xpGained: 15, xp: 15, level: 2, dead: false },
    { heroId: 'h2', xpGained: 0, xp: 0, level: 1, dead: true },
  ],
};

/** The one unlock of the content, which the caravan hub's scouting job grants. */
const ROAD: UnlockId = 'road-to-highcrag';
/** An unlock the player holds, as `me.unlocks` answers it: with the adventure that first earned it. */
interface Held {
  readonly unlock: string;
  readonly adventureId: string;
}

/** A game with the open adventure and a submit that answers as the test says, recording each log it was given. */
function fakeGame(answer: () => AdventureResultView | null | Error = () => result, opened: AdventureView = adventure) {
  const open = signal<AdventureView | null>(opened);
  const settled = signal<SettledView | null>(null);
  const held = signal<readonly Held[]>([]);
  const fake = {
    location: signal('millbrook'),
    player: computed(() => ({ id: 'p1', camps: [], heroes: [], openAdventure: open(), unlocks: held() })),
    /** The unlocks the player holds once the submit has answered and the player is read again. */
    holdsAfter: [] as readonly Held[],
    /** Why the player could not be read, as the read after a submit leaves it; null once a read succeeds. */
    error: signal<string | null>(null),
    /** Whether the read after the submit fails, as when the hub is not reached for it. */
    readFails: false,
    reloads: 0,
    reload: () => {
      fake.reloads++;
      held.set(fake.holdsAfter);
      fake.error.set(null);
      return Promise.resolve();
    },
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
      if (fake.readFails) fake.error.set('The hub could not be reached.');
      else held.set(fake.holdsAfter);
      return Promise.resolve();
    },
  };
  return fake;
}

async function renderAdventure(game: ReturnType<typeof fakeGame>, scene = fakeBattleScene()) {
  const frames = fakeFrameLoop();
  const { router, settle, user } = await renderAt(
    '/adventure',
    [
      { path: 'adventure', component: Adventure },
      { path: 'camp/:location', component: Blank },
    ],
    [
      { provide: Game, useValue: game },
      { provide: FRAME_LOOP, useValue: frames.loop },
      { provide: BATTLE_SCENE_FACTORY, useValue: scene.factory },
      testLayoutSizes,
    ],
  );
  // The scene loads after the first render; the run starts once it has, and is handed over for its art.
  await waitFor(() => { expect(scene.prepared.length).toBeGreaterThan(0); });
  await settle();
  const run = async (ms: number) => {
    frames.advance(ms);
    await settle();
  };
  return { run, router, user };
}

const link = (name: string) => screen.getByRole('link', { name });
/** What a hero may do next: the group of its ability buttons. */
const abilities = (hero: string) => within(screen.getByRole('group', { name: `${hero} next action` }));
/** A hero's item in the party, which holds what it will do next. */
const heroItem = (hero: string) => within(itemHolding('Party', 'group', `${hero} next action`));
/** Why the ability buttons wait while the party travels: what the page says of where the party is, since it lists no stages (Issue-339). */
const ON_THE_ROAD = 'On the road: abilities are for a fight or a gather.';
const onTheRoad = () => screen.getByText(ON_THE_ROAD);
/** The villager's chop, which can be used once the party is among the trees. */
const chop = () => abilities('Wren').getByRole('button', { name: 'Chop' });
/** The live region that says what the party carries: in the page from the start, and empty while it carries nothing. */
const carryingLine = () => screen.getByRole('status');
/** What the party carries, as the page says it, or null while it carries nothing. */
const carrying = () => carryingLine().textContent || null;

describe('Adventure', () => {
  beforeEach(() => { localStorage.clear(); });

  it("shows the job and each hero's abilities, usable only in a fight or a gather, and lists none of the job's stages", async () => {
    const { run } = await renderAdventure(fakeGame());
    expect(screen.getByRole('heading', { name: 'Timber from the near woods', level: 2 })).toBeInTheDocument();
    expect(screen.queryByText(/^Stage \d/)).not.toBeInTheDocument();
    expect(textsOf(abilities('Wren').getAllByRole('button'))).toEqual(['Strike', 'Chop', 'Mine', 'Move up']);
    expect(textsOf(abilities('Wat').getAllByRole('button'))).toEqual(['Guard', 'Strike']);
    expect(chop()).toBeDisabled();
    // The reason is beside the disabled buttons, and each hero's group is described by it.
    const wait = ON_THE_ROAD;
    expect(onTheRoad()).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Wren next action' })).toHaveAccessibleDescription(wait);

    await run(4100);
    expect(chop()).toBeEnabled();
    expect(screen.queryByText(/^Stage \d/)).not.toBeInTheDocument();
    expect(screen.queryByText(wait)).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Wren next action' })).not.toHaveAccessibleDescription();
  });

  it('says what the party carries the moment an enemy falls, before the stage ends, and nothing until then (Issue-339)', async () => {
    const { run } = await renderAdventure(fakeGame());
    // The line is there before anything drops, so that the first drop is a change a screen reader speaks.
    expect(carryingLine()).toBeInTheDocument();
    expect(carrying()).toBeNull();
    await run(4100);
    expect(carrying()).toBeNull();
    const amountAfter = async (before: string | null) => {
      for (let second = 0; second < 60 && carrying() === before; second++) await run(1000);
      return Number(/^Carrying (\d+) timber$/.exec(carrying() ?? '')?.[1]);
    };
    // The first tree of two: its drop at a villager's woodcutting, with the second still standing and the stage under way.
    const first = await amountAfter(null);
    expect(first).toBeGreaterThanOrEqual(30);
    expect(first).toBeLessThanOrEqual(36);
    expect(chop()).toBeEnabled();
    const both = await amountAfter(`Carrying ${first} timber`);
    expect(both - first).toBeGreaterThanOrEqual(30);
    expect(both - first).toBeLessThanOrEqual(36);
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
    expect(onTheRoad()).toBeInTheDocument();
    // The button's name says its state, so it carries no pressed state beside it.
    expect(button('Resume')).not.toHaveAttribute('aria-pressed');
    await user.click(button('Resume'));
    await user.click(button('4×'));
    await waitFor(() => { expect(button('4×')).toHaveAttribute('aria-pressed', 'true'); });
    await run(1100);
    expect(chop()).toBeEnabled();
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
    const scene = fakeBattleScene(true);
    const { run } = await renderAdventure(fakeGame(), scene);
    expect(scene.resets).toMatchObject([{ field: { stage: 0 }, enter: true }]);
    await run(2000);
    expect(scene.fed).toEqual([]);
    scene.release();
    await run(4100);
    expect(chop()).toBeEnabled();
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

  it('holds the clock after a blow for as long as the scene asks, and runs on when that is over (Issue-335)', async () => {
    const scene = fakeBattleScene();
    const { run } = await renderAdventure(fakeGame(), scene);
    // Asked for nothing, the clock runs on: three seconds after a blow, more has happened.
    let fed = await runToBlow(run, scene);
    await run(3000);
    expect(scene.fed.length).toBeGreaterThan(fed);

    // Asked for three seconds after a blow, nothing more happens for three seconds, and then it does.
    scene.holdFor = (events) => (landsBlow(events) ? 3000 : 0);
    fed = await runToBlow(run, scene);
    await run(3000);
    expect(scene.fed).toHaveLength(fed);
    // The scene is still drawn through the wait: its clips play while the clock stands.
    const frames = scene.frames;
    await run(3000);
    expect(scene.fed.length).toBeGreaterThan(fed);
    expect(scene.frames).toBeGreaterThan(frames);
  });

  it('runs a hold down in presentation time, so that it is over sooner at a higher speed', async () => {
    const scene = fakeBattleScene();
    scene.holdFor = (events) => (landsBlow(events) ? 3000 : 0);
    const { run, user } = await renderAdventure(fakeGame(), scene);
    await user.click(button('4×'));
    await waitFor(() => { expect(button('4×')).toHaveAttribute('aria-pressed', 'true'); });
    const fed = await runToBlow(run, scene);
    // Three seconds of hold are three quarters of a second at 4×: two frames in, it still holds.
    await run(500);
    expect(scene.fed).toHaveLength(fed);
    // The third frame ends it, and the frames after move the run.
    await run(1000);
    expect(scene.fed.length).toBeGreaterThan(fed);
  });

  it('does not run a hold down while paused', async () => {
    const scene = fakeBattleScene();
    scene.holdFor = (events) => (landsBlow(events) ? 3000 : 0);
    const { run, user } = await renderAdventure(fakeGame(), scene);
    const fed = await runToBlow(run, scene);
    await user.click(button('Pause'));
    await run(10_000);
    await user.click(button('Resume'));
    await run(3000);
    expect(scene.fed).toHaveLength(fed);
    await run(3000);
    expect(scene.fed.length).toBeGreaterThan(fed);
  });

  it('lets an entry take the place of a hold asked for in the same frame', async () => {
    const scene = fakeBattleScene(true);
    scene.holdFor = (events) => (events.some(isEntry) ? 60_000 : 0);
    const { run } = await renderAdventure(fakeGame(), scene);
    scene.release();
    await run(4100);
    expect(chop()).toBeEnabled();
    const fed = scene.fed.length;
    // Everyone on, the clock runs at once: the minute asked for with the entry was never held.
    scene.release();
    await run(3000);
    expect(scene.fed.length).toBeGreaterThan(fed);
  });

  it('submits the run only once the hold for its last action is over', async () => {
    const game = fakeGame();
    const scene = fakeBattleScene();
    const over = (events: readonly { readonly kind: string }[]) => events.some((event) => event.kind === 'adventure-end');
    scene.holdFor = (events) => (over(events) ? 3000 : 0);
    const { run } = await renderAdventure(game, scene);
    for (let frame = 0; frame < 600 && !over(scene.fed); frame++) await run(250);
    expect(over(scene.fed)).toBe(true);
    // The run is over and its log is kept; the hub hears of it when the last action has been shown.
    expect(game.submitted).toHaveLength(0);
    expect(loadRun('a1')).not.toBeNull();
    await run(2750);
    expect(game.submitted).toHaveLength(0);
    await run(500);
    expect(game.submitted).toHaveLength(1);
  });

  it('resumes from the log saved in the browser, at the time it reached', async () => {
    const earlier = new AdventureRun(adventure.snapshot as AdventureSnapshot, adventure.seed);
    earlier.advanceTo(8000);
    saveRun('a1', { log: earlier.log, simTime: earlier.simTime });
    const scene = fakeBattleScene();
    await renderAdventure(fakeGame(), scene);
    expect(screen.getByText('Picked up where you left off.')).toBeInTheDocument();
    // Picked up, everyone stands where they were: nobody runs on.
    expect(scene.resets.map((r) => r.enter)).toEqual([false]);
    expect(chop()).toBeEnabled();
  });

  it('begins a run only once the scene has the art of the party and of everyone this adventure sets against it', async () => {
    const scene = fakeBattleScene(false, true);
    const { run } = await renderAdventure(fakeGame(), scene);
    expect(scene.prepared).toEqual([
      [
        { kind: 'hero', type: 'fighter', spriteSet: 'fighter-02' },
        { kind: 'hero', type: 'villager', spriteSet: 'villager-01' },
        { kind: 'resource', type: 'tree' },
        { kind: 'monster', type: 'wolf' },
      ],
    ]);
    // Until the art is in, the scene is shown nothing and the run does not move.
    await run(5000);
    expect(scene.resets).toEqual([]);
    expect(scene.frames).toBe(0);
    expect(onTheRoad()).toBeInTheDocument();
    await scene.artArrives();
    await run(4100);
    expect(scene.resets).toMatchObject([{ field: { stage: 0 }, enter: true }]);
    expect(chop()).toBeEnabled();
  });

  // A job that varies (Issue-341): the scene is handed the art of who this adventure's seed rolls, the first job's wolf among them only on a run that meets one.
  for (const wolf of [true, false]) {
    it(`hands the scene the first job's tree and ${wolf ? 'its wolf, on a seed that rolls one' : 'no wolf, on a seed that rolls none'}`, async () => {
      const sticks = (seed: string): AdventureView => ({
        ...adventure,
        seed,
        job: { id: 'pick-up-sticks', name: 'Pick up sticks', description: 'One old tree.' },
        snapshot: { ...adventure.snapshot, jobId: 'pick-up-sticks' },
      });
      // Whether a seed's run meets the wolf is read off the engine's own run of it.
      const meetsWolf = (seed: string) =>
        replay(sticks(seed).snapshot as AdventureSnapshot, seed, []).timeline.events.some((e) => e.kind === 'battle-start' && e.participants.some((p) => p.type === 'wolf'));
      const seed = must(range(200).map((i) => `seed-${i}`).find((s) => meetsWolf(s) === wolf), 'a seed of the kind');
      const scene = fakeBattleScene(false, true);
      await renderAdventure(fakeGame(() => result, sticks(seed)), scene);
      expect(scene.prepared).toEqual([
        [
          { kind: 'hero', type: 'fighter', spriteSet: 'fighter-02' },
          { kind: 'hero', type: 'villager', spriteSet: 'villager-01' },
          { kind: 'resource', type: 'tree' },
          ...(wolf ? [{ kind: 'monster', type: 'wolf' }] : []),
        ],
      ]);
    });
  }

  it('holds a resumed run the same way, where nobody runs on', async () => {
    const earlier = new AdventureRun(adventure.snapshot as AdventureSnapshot, adventure.seed);
    earlier.advanceTo(8000);
    saveRun('a1', { log: earlier.log, simTime: earlier.simTime });
    const scene = fakeBattleScene(false, true);
    const { run } = await renderAdventure(fakeGame(), scene);
    await run(3000);
    expect(scene.resets).toEqual([]);
    expect(scene.fed).toEqual([]);
    await scene.artArrives();
    await run(3000);
    expect(scene.resets.map((r) => r.enter)).toEqual([false]);
    expect(scene.fed.length).toBeGreaterThan(0);
  });

  it("submits the log at the end, shows the result in the player's words, and goes back to camp", async () => {
    const game = fakeGame();
    const { run, router, user } = await renderAdventure(game);
    await run(120_000);
    expect(game.submitted).toHaveLength(1);
    expect(loadRun('a1')).toBeNull();
    expect(await screen.findByText('Job done.')).toBeInTheDocument();
    expect(textsOf(listItems('Stages'))).toEqual(['travel: done', 'gather: won', 'fight: won', 'arrive: done']);
    expect(wordsOf(listItems('Rewards'))).toEqual(['timber 60', 'cloth 3']);
    expect(wordsOf([screen.getByText(/lost: the warehouse was full/)])).toEqual(['timber 10 lost: the warehouse was full.']);
    expect(screen.queryByText(/cloth lost/)).not.toBeInTheDocument();
    expect(wordsOf(listItems('Heroes'))).toEqual(['Wat fighter, level 2 +15 XP level up', 'Wren villager, level 1 died']);

    await user.click(link('Back to Millbrook'));
    await waitFor(() => { expect(router.url).toBe('/camp/millbrook'); });
    expect(game.settled()).toBeNull();
  });

  it('says what a caravan delivered, what the cap lost and who stayed (Issue-355)', async () => {
    const caravan = { destination: 'highcrag', cargo: [{ material: 'timber', amount: 60 }, { material: 'ore', amount: 40 }], staying: ['h2'], riders: [] };
    const delivered = { ...result, delivered: [{ material: 'timber', amount: 60 }, { material: 'ore', amount: 30 }], deliveryLost: [{ material: 'timber', amount: 0 }, { material: 'ore', amount: 10 }] };
    const { run } = await renderAdventure(fakeGame(() => delivered, { ...adventure, caravan }));
    await run(120_000);
    expect(await screen.findByText('Job done.')).toBeInTheDocument();
    expect(textsOf(listItems('Caravan'))).toEqual(['Delivered to Highcrag: 60 timber and 30 ore.', "10 ore lost: Highcrag's warehouse was full.", 'Stayed at Highcrag: Wren.']);
  });

  // Cora is of no party, so the snapshot does not hold her: the caravan names her (Issue-391).
  it.each([
    ['who rode along with a caravan that arrived', 'complete' as const, ['Stayed at Highcrag: Wren.', 'Rode along to Highcrag: Cora.']],
    ['that a rider is back where the party went down', 'defeat' as const, ['Nobody stayed at Highcrag: the caravan did not arrive.', 'Cora rode along and is back at Millbrook.']],
  ])('says %s, by the name the caravan holds', async (_what, outcome, lines) => {
    const caravan = { destination: 'highcrag', cargo: [], staying: ['h2', 'h9'], riders: [{ heroId: 'h9', name: 'Cora' }] };
    const { run } = await renderAdventure(fakeGame(() => ({ ...result, outcome }), { ...adventure, caravan }));
    await run(120_000);
    await waitFor(() => { expect(textsOf(listItems('Caravan'))).toEqual(lines); });
  });

  it("says a discarded caravan's cargo went back to the camp it left", async () => {
    const caravan = { destination: 'highcrag', cargo: [{ material: 'timber', amount: 60 }], staying: ['h2'], riders: [] };
    const { run } = await renderAdventure(fakeGame(() => null, { ...adventure, caravan }));
    await run(120_000);
    expect(await screen.findByText(/lost to a game update/)).toBeInTheDocument();
    expect(screen.getByText("The cargo went back to Millbrook's warehouse.")).toBeInTheDocument();
    expect(screen.getByText('Nobody stayed at Highcrag: the caravan did not arrive.')).toBeInTheDocument();
  });

  it('says nothing of a caravan for a job that delivers nothing', async () => {
    const { run } = await renderAdventure(fakeGame());
    await run(120_000);
    expect(await screen.findByText('Job done.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Caravan' })).not.toBeInTheDocument();
  });

  it("tells the player an unlock the run earned that they did not hold, in the content's words, under how it ended (Issue-352)", async () => {
    const game = fakeGame();
    // The player's own unlock names this adventure, so it was new.
    game.holdsAfter = [{ unlock: ROAD, adventureId: adventure.id }];
    const { run } = await renderAdventure(game);
    await run(120_000);
    expect(await screen.findByText('Job done.')).toBeInTheDocument();
    expect(await within(screen.getByRole('status')).findByText(UNLOCKS[ROAD].earned)).toBeInTheDocument();
    expect(UNLOCKS[ROAD].earned).toMatch(/Highcrag/);
    expect(screen.queryByRole('button', { name: 'Read again' })).not.toBeInTheDocument();
  });

  it('says nothing of an unlock the run earned again: the player holds it from an earlier adventure', async () => {
    const game = fakeGame();
    game.holdsAfter = [{ unlock: ROAD, adventureId: 'an-earlier-adventure' }];
    const { run } = await renderAdventure(game);
    await run(120_000);
    expect(await screen.findByText('Job done.')).toBeInTheDocument();
    expect(screen.queryByText(UNLOCKS[ROAD].earned)).not.toBeInTheDocument();
  });

  it('has the place for that news in the page with the result, empty until there is some, so that it is spoken when it arrives', async () => {
    const game = fakeGame();
    const { run } = await renderAdventure(game);
    await run(120_000);
    expect(await screen.findByText('Job done.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('says so where the player could not be read again after the run was sent, and tells the unlock once Read again has read them', async () => {
    const game = fakeGame();
    game.holdsAfter = [{ unlock: ROAD, adventureId: adventure.id }];
    game.readFails = true;
    const { run, user } = await renderAdventure(game);
    await run(120_000);
    expect(await screen.findByText('Your camp could not be read again, so anything this run opened is not shown yet.')).toHaveRole('alert');
    expect(screen.queryByText(UNLOCKS[ROAD].earned)).not.toBeInTheDocument();

    await user.click(button('Read again'));
    expect(await within(screen.getByRole('status')).findByText(UNLOCKS[ROAD].earned)).toBeInTheDocument();
    expect(game.reloads).toBe(1);
    expect(screen.queryByRole('button', { name: 'Read again' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  for (const [location, ground] of [['millbrook', 'meadow-01'], ['highcrag', 'crag-01']] as const) {
    it(`hands the scene the ground of the location the run left from: ${ground} for ${location} (Issue-352)`, async () => {
      const scene = fakeBattleScene();
      await renderAdventure(fakeGame(() => result, { ...adventure, location }), scene);
      expect(scene.grounds).toEqual([ground]);
    });
  }

  it('replays the stored timeline in the scene from its start, and goes back to the result', async () => {
    const scene = fakeBattleScene();
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

  it('says a replay stored before the battles changed is unavailable, and plays none of it', async () => {
    const scene = fakeBattleScene();
    const game = fakeGame();
    const stored = await game.timeline('a1');
    game.timeline = () => Promise.resolve({ ...stored, schemaVersion: stored.schemaVersion - 1 });
    const { run, user } = await renderAdventure(game, scene);
    await run(120_000);
    await user.click(await screen.findByRole('button', { name: 'Watch the replay' }));
    expect(await screen.findByText('Replay unavailable: this adventure was played before the battles changed.')).toHaveRole('alert');
    expect(scene.resets).toHaveLength(1);
    expect(screen.queryByText('Replay')).not.toBeInTheDocument();
    expect(screen.getByText('Job done.')).toBeInTheDocument();
  });

  it('says so when the adventure was lost to a game update', async () => {
    const { run } = await renderAdventure(fakeGame(() => null));
    await run(120_000);
    expect(await screen.findByText('This adventure was lost to a game update. The party came home with nothing.')).toHaveRole('alert');
    expect(link('Back to Millbrook')).toHaveAttribute('href', '/camp/millbrook');
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
