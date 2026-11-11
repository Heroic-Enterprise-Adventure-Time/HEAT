import { computed, signal } from '@angular/core';
import { screen, waitFor, within } from '@testing-library/angular/zoneless';

import { must, UNIT_PROFILES } from '@heat/engine';

import { BATTLE_SCENE_FACTORY, FRAME_LOOP } from '../../adventure/adventure';
import { routes } from '../../app.routes';
import { type AdventureView, Game, type HeroView } from '../../game';
import { Refusal } from '../../hub';
import { Session } from '../../session';
import { fakeCampScene } from '../../testing/fake-camp-scene';
import { fakeSession, PLAYER } from '../../testing/fake-session';
import { testLayoutSizes } from '../../testing/layout-sizes';
import { itemHolding, listItems, menu, panel, panelBox } from '../../testing/page';
import { renderAt } from '../../testing/render-at';
import { textsOf } from '../../testing/texts-of';
import { CAMP_SCENE_FACTORY } from '../camp';

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
function fakeGame(heroes: HeroView[], answer: (heroIds: readonly string[]) => AdventureView | Refusal = adventureOf) {
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
      facilities: [{ kind: 'mine', level: 1 }],
    }),
    recruits: signal([]),
    upgrade: () => null,
    location: signal('millbrook'),
    player: computed(() => ({ id: 'p1', camps: [], heroes: all(), openAdventure: open() })),
    adventure: open,
    settled: signal(null),
    error: signal<string | null>(null),
    started: [] as { location: string; jobId: string; heroIds: readonly string[] }[],
    startAdventure: (location: string, jobId: string, heroIds: readonly string[]) => {
      fake.started.push({ location, jobId, heroIds });
      const result = answer(heroIds);
      if (result instanceof Refusal) return Promise.reject(result);
      open.set(result);
      return Promise.resolve(result);
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
        .map((h) => ({ heroId: h.id, name: h.name, unitType: h.unitType, spriteSet: h.spriteSet, level: h.level, stats: must(UNIT_PROFILES.villager, 'the villager profile').stats })),
    },
  };
}

function renderJobs(game: ReturnType<typeof fakeGame>, url: string) {
  return renderAt(url, routes, [
    { provide: Game, useValue: game },
    { provide: Session, useValue: fakeSession(PLAYER) },
    // The adventure's frames never come, so a run stays at its start.
    { provide: FRAME_LOOP, useValue: () => () => undefined },
    { provide: BATTLE_SCENE_FACTORY, useValue: async () => Promise.reject(new Error('no WebGL in jsdom')) },
    { provide: CAMP_SCENE_FACTORY, useValue: fakeCampScene },
    testLayoutSizes,
  ]);
}

const WOLVES = '/camp/millbrook/job-board/jobs/wolves-on-the-mill-road';

const box = (name: string) => screen.getByRole('checkbox', { name });
const depart = () => screen.getByRole('button', { name: 'Depart' });
const job = (name: string) => within(itemHolding('Jobs', 'link', name));

describe('Job board', () => {
  it("lists the board's jobs, easiest first, with what each brings home, each linked to its detail", async () => {
    await renderJobs(fakeGame([]), '/camp/millbrook/job-board');
    expect(panel().getByRole('heading', { name: 'Job board', level: 2 })).toBeInTheDocument();
    expect(textsOf(listItems('Jobs').map((li) => within(li).getByRole('link')))).toEqual(['Pick up sticks', 'Timber from the near woods', 'Wolves on the mill road']);
    expect(job('Pick up sticks').getByText('up to 45 timber')).toBeInTheDocument();
    expect(job('Timber from the near woods').getByText('3 cloth and up to 90 timber')).toBeInTheDocument();
    expect(job('Wolves on the mill road').getByText('10 cloth')).toBeInTheDocument();
    expect(panel().getByRole('link', { name: 'Pick up sticks' })).toHaveAttribute('href', '/camp/millbrook/job-board/jobs/pick-up-sticks');
    expect(menu().getByRole('link', { name: 'Job board', current: 'page' })).toBeInTheDocument();
  });

  it("shows a job's stages in order, its credits beside the camp's balance and room, and its retreat penalty", async () => {
    await renderJobs(fakeGame([must(party[0], 'the first of the party')]), '/camp/millbrook/job-board/jobs/timber-from-the-near-woods');
    expect(panel().getByRole('heading', { name: 'Timber from the near woods', level: 2 })).toBeInTheDocument();
    expect(textsOf(listItems('Stages'))).toEqual(['Travel', 'Gather timber from 2 trees', 'Fight a wolf', 'Arrive']);
    expect(textsOf(listItems('Reward'))).toEqual([
      '3 cloth. Millbrook holds 0, with room for 100 more.',
      'Up to 90 timber. Millbrook holds 90, with room for 10 more.',
      '15 XP to each hero who comes back.',
    ]);
    expect(panel().getByText('A retreat forfeits the pay, keeps the timber gathered, and earns half the XP.')).toBeInTheDocument();
    expect(menu().getByRole('link', { name: 'Job board', current: 'page' })).toBeInTheDocument();
    expect(panel().getByRole('link', { name: '← Job board' })).toHaveAttribute('href', '/camp/millbrook/job-board');
  });

  it('picks one to four living heroes, never the dead, and Departs only with one picked', async () => {
    const { user } = await renderJobs(fakeGame([...party, hero('h6', 'Rook', 'DEAD')]), WOLVES);
    expect(screen.queryByRole('checkbox', { name: 'Rook' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(5);
    // The checkboxes are one labeled group, the Party heading's, described by the rule they follow.
    const group = screen.getByRole('group', { name: 'Party' });
    expect(group).toHaveAccessibleDescription('Pick one to 4 heroes.');
    expect(within(group).getAllByRole('checkbox')).toHaveLength(5);
    expect(depart()).toBeDisabled();

    for (const name of ['Wren', 'Moss', 'Lark', 'Fen']) await user.click(box(name));
    await waitFor(() => { expect(depart()).toBeEnabled(); });
    expect(box('Wren')).toBeEnabled();
    expect(box('Fen')).toBeEnabled();
    expect(box('Ash')).toBeDisabled();

    await user.click(box('Wren'));
    await waitFor(() => { expect(box('Ash')).toBeEnabled(); });
  });

  it('Departs through startAdventure and goes to the adventure, which shows the job and the party', async () => {
    const game = fakeGame(party);
    const { router, user } = await renderJobs(game, WOLVES);
    await user.click(box('Wren'));
    await user.click(box('Lark'));
    await waitFor(() => { expect(depart()).toBeEnabled(); });
    await user.click(depart());
    await waitFor(() => { expect(router.url).toBe('/adventure'); });
    expect(game.started).toEqual([{ location: 'millbrook', jobId: 'wolves-on-the-mill-road', heroIds: ['h1', 'h3'] }]);

    expect(await screen.findByRole('heading', { name: 'Wolves on the mill road', level: 2 })).toBeInTheDocument();
    // The run starts once the scene has loaded, or failed to as it does in jsdom.
    const heroes = await screen.findAllByRole('group', { name: /next action$/ });
    expect(heroes).toHaveLength(2);
    expect(heroes[0]).toHaveAccessibleName('Wren next action');
    expect(heroes[1]).toHaveAccessibleName('Lark next action');
  });

  it("shows a start's refusal in place, in the player's words", async () => {
    const game = fakeGame(party, () => new Refusal('HeroDead', 'hero h1 is dead'));
    const { router, user } = await renderJobs(game, WOLVES);
    await user.click(box('Wren'));
    await waitFor(() => { expect(depart()).toBeEnabled(); });
    await user.click(depart());
    expect(await screen.findByText('A hero in the party is dead.')).toHaveRole('alert');
    expect(router.url).toBe(WOLVES);
  });

  it("says to build the facility when the hub refuses a facility's job with Requires (Issue-133)", async () => {
    const game = fakeGame(party, () => new Refusal('Requires', 'Ore from the hill needs a level 1 mine first'));
    const { user } = await renderJobs(game, '/camp/millbrook/mine/jobs/ore-from-the-hill');
    await user.click(box('Wren'));
    await waitFor(() => { expect(depart()).toBeEnabled(); });
    await user.click(depart());
    expect(await screen.findByText('Build the mine first.')).toHaveRole('alert');
    expect(game.started[0]?.jobId).toBe('ore-from-the-hill');
  });

  it("shows a refusal it has no words for as the hub put it", async () => {
    const game = fakeGame(party, () => new Refusal('SomethingNew', 'something new'));
    const { user } = await renderJobs(game, WOLVES);
    await user.click(box('Wren'));
    await waitFor(() => { expect(depart()).toBeEnabled(); });
    await user.click(depart());
    expect(await screen.findByText('something new')).toHaveRole('alert');
  });

  it('sends a camp with no living hero to the hall', async () => {
    await renderJobs(fakeGame([hero('h6', 'Rook', 'DEAD')]), WOLVES);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Depart' })).not.toBeInTheDocument();
    expect(panelBox()).toHaveTextContent('No hero here is alive.');
    expect(panel().getByRole('link', { name: 'heroes hall' })).toHaveAttribute('href', '/camp/millbrook/heroes-hall');
  });

  it('leads to the open adventure from the job, the board and the menu, instead of offering Depart', async () => {
    const game = fakeGame(party);
    game.adventure.set(adventureOf(['h1']));
    await renderJobs(game, '/camp/millbrook/job-board/jobs/timber-from-the-near-woods');
    expect(screen.queryByRole('button', { name: 'Depart' })).not.toBeInTheDocument();
    expect(panel().getByRole('link', { name: 'Wolves on the mill road' })).toHaveAttribute('href', '/adventure');
    const entry = menu().getByRole('link', { name: 'Adventure' });
    expect(entry).toHaveAttribute('href', '/adventure');
    expect(within(entry).getByRole('presentation')).toHaveAttribute('src', 'art/icons/adventure.png');
  });

  it('has no adventure entry in the menu while none is open', async () => {
    await renderJobs(fakeGame(party), '/camp/millbrook/job-board');
    expect(menu().queryByRole('link', { name: 'Adventure' })).not.toBeInTheDocument();
  });

  it('says so for a job the board does not post', async () => {
    await renderJobs(fakeGame(party), '/camp/millbrook/job-board/jobs/nothing');
    expect(panel().getByText('The job board has no such job.')).toBeInTheDocument();
  });

  it('sends /adventure to the camp when no adventure is open', async () => {
    const { router } = await renderJobs(fakeGame(party), '/adventure');
    await waitFor(() => { expect(router.url).toBe('/camp/millbrook/heroes-hall'); });
  });
});
