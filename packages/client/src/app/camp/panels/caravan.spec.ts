import { computed, signal } from '@angular/core';
import { screen, waitFor, within } from '@testing-library/angular/zoneless';

import { JOBS } from '@heat/engine';

import { BATTLE_SCENE_FACTORY, FRAME_LOOP } from '../../adventure/battle-view';
import { routes } from '../../app.routes';
import { type AdventureView, type CampView, type CaravanStart, Game, type HeroView } from '../../game';
import { Refusal } from '../../hub';
import { Session } from '../../session';
import { fakeCampScene } from '../../testing/fake-camp-scene';
import { fakeIcons } from '../../testing/fake-icons';
import { fakeSession, PLAYER } from '../../testing/fake-session';
import { testLayoutSizes } from '../../testing/layout-sizes';
import { listItems, panel } from '../../testing/page';
import { renderAt } from '../../testing/render-at';
import { textsOf } from '../../testing/texts-of';
import { CAMP_SCENE_FACTORY } from '../camp';

function hero(id: string, name: string): HeroView {
  return { id, name, unitType: 'fighter', spriteSet: 'fighter-02', location: 'millbrook', recruitedAt: '2026-10-20T07:00:00.000Z', level: 2, xp: 30, status: 'ALIVE', retiredAt: null };
}

const party = [hero('h1', 'Wren'), hero('h2', 'Moss'), hero('h3', 'Lark')];

/** Millbrook with its caravan hub built, holding timber and ore and no cloth. */
const millbrook: CampView = {
  location: 'millbrook',
  name: 'Millbrook',
  hallLevel: 1,
  heroCapacity: 4,
  activeHeroes: 3,
  livingHeroes: 3,
  warehouseLevel: 2,
  resourceCapacity: 200,
  holdings: [
    { material: 'timber', balance: 90 },
    { material: 'ore', balance: 40 },
    { material: 'cloth', balance: 0 },
  ],
  facilities: [
    { kind: 'heroes-hall', level: 1 },
    { kind: 'warehouse', level: 2 },
    { kind: 'mine', level: 1 },
    { kind: 'lumber-camp', level: 0 },
    { kind: 'caravan-hub', level: 1 },
  ],
};

/** Highcrag's camp with two of its four slots taken and ore in its warehouse. */
const highcrag: CampView = {
  location: 'highcrag',
  name: 'Highcrag',
  hallLevel: 1,
  heroCapacity: 4,
  activeHeroes: 2,
  livingHeroes: 2,
  warehouseLevel: 1,
  resourceCapacity: 100,
  holdings: [{ material: 'ore', balance: 70 }],
  facilities: [
    { kind: 'heroes-hall', level: 1 },
    { kind: 'warehouse', level: 1 },
  ],
};

/** A game at Millbrook with the camps given, and a start that records what it was sent and answers as the test says. */
function fakeGame(camps: readonly CampView[] = [millbrook, highcrag], answer: () => Refusal | null = () => null) {
  const open = signal<AdventureView | null>(null);
  const fake = {
    heroesHere: signal(party),
    livingHere: signal(party),
    retiredHere: signal([]),
    onTheWay: signal([]),
    seenHere: signal([]),
    camp: signal(millbrook),
    recruits: signal([]),
    upgrade: () => null,
    location: signal('millbrook'),
    player: computed(() => ({ id: 'p1', camps, heroes: party, openAdventure: open(), unlocks: [] })),
    adventure: open,
    settled: signal(null),
    error: signal<string | null>(null),
    recentAdventuresAt: () => Promise.resolve([]),
    replaysOf: () => Promise.resolve([]),
    started: [] as { jobId: string; heroIds: readonly string[]; caravan: CaravanStart | undefined }[],
    startAdventure: (_location: string, jobId: string, heroIds: readonly string[], caravan?: CaravanStart) => {
      fake.started.push({ jobId, heroIds, caravan });
      const refusal = answer();
      return refusal ? Promise.reject(refusal) : new Promise<never>(() => undefined);
    },
  };
  return fake;
}

function renderCaravan(game: ReturnType<typeof fakeGame>) {
  return renderAt(CARAVAN, routes, [
    { provide: Game, useValue: game },
    { provide: Session, useValue: fakeSession(PLAYER) },
    { provide: FRAME_LOOP, useValue: () => () => undefined },
    { provide: BATTLE_SCENE_FACTORY, useValue: async () => Promise.reject(new Error('no WebGL in jsdom')) },
    { provide: CAMP_SCENE_FACTORY, useValue: fakeCampScene },
    fakeIcons,
    testLayoutSizes,
  ]);
}

const CARAVAN = '/camp/millbrook/caravan-hub/jobs/caravan-to-highcrag';
const depart = () => screen.getByRole('button', { name: 'Depart' });
const partyBox = (name: string) => within(screen.getByRole('group', { name: 'Party' })).getByRole('checkbox', { name });
const stays = (name: string) => within(screen.getByRole('group', { name: 'Who stays' })).getByRole('checkbox', { name: `${name} stays at Highcrag` });
const amount = (material: string) => within(panel().getByRole('list', { name: 'Cargo' })).getByRole('spinbutton', { name: material });

/** Types an amount into a resource's field, replacing what was there. */
async function load(user: Awaited<ReturnType<typeof renderCaravan>>['user'], material: string, value: string) {
  await user.clear(amount(material));
  if (value !== '') await user.type(amount(material), value);
}

describe("A caravan's page (Issue-355)", () => {
  it("offers each resource the camp holds, beside its balance and Highcrag's room for it, against what the cart carries", async () => {
    await renderCaravan(fakeGame());
    expect(panel().getByRole('heading', { name: 'Caravan to Highcrag', level: 2 })).toBeInTheDocument();
    expect(panel().getByText(JOBS['caravan-to-highcrag'].description)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Cargo' })).toHaveAccessibleDescription('Cargo: 0 of the 100 the cart carries.');
    expect(textsOf(listItems('Cargo'))).toEqual(['timber Millbrook holds 90. Highcrag has room for 100 more.', 'ore Millbrook holds 40. Highcrag has room for 30 more.']);
    expect(amount('timber')).toHaveValue(0);
  });

  it('says before departing that a retreat abandons the cargo, and that a hero who stays cannot come back while Highcrag has no caravan hub', async () => {
    await renderCaravan(fakeGame());
    expect(panel().getByText('A retreat keeps what dropped and the XP earned, and loses the bonus and the cargo.')).toBeInTheDocument();
    expect(panel().getByText('A hero who stays cannot come back until Highcrag has a caravan hub.')).toBeInTheDocument();
  });

  it('says nothing of coming back once the destination has a caravan hub', async () => {
    await renderCaravan(fakeGame([millbrook, { ...highcrag, facilities: [...highcrag.facilities, { kind: 'caravan-hub', level: 1 }] }]));
    expect(panel().queryByText(/cannot come back/)).not.toBeInTheDocument();
  });

  it("offers who stays from the party alone, beside Highcrag's free slots", async () => {
    const { user } = await renderCaravan(fakeGame());
    const group = screen.getByRole('group', { name: 'Who stays' });
    expect(group).toHaveAccessibleDescription("Highcrag's heroes hall has room for 2 more.");
    expect(within(group).queryAllByRole('checkbox')).toHaveLength(0);
    expect(within(group).getByText('Pick the party first.')).toBeInTheDocument();

    await user.click(partyBox('Wren'));
    await user.click(partyBox('Lark'));
    await waitFor(() => { expect(within(group).getAllByRole('checkbox')).toHaveLength(2); });
    expect(stays('Wren')).not.toBeChecked();
    expect(stays('Lark')).toBeInTheDocument();
  });

  it('Departs with the cargo picked and who stays, leaving out a resource at 0', async () => {
    const game = fakeGame();
    const { user } = await renderCaravan(game);
    await user.click(partyBox('Wren'));
    await user.click(partyBox('Moss'));
    await load(user, 'timber', '60');
    await load(user, 'ore', '40');
    await user.click(await screen.findByRole('checkbox', { name: 'Wren stays at Highcrag' }));
    await waitFor(() => { expect(screen.getByRole('list', { name: 'Cargo' })).toHaveAccessibleDescription('Cargo: 100 of the 100 the cart carries.'); });
    await waitFor(() => { expect(depart()).toBeEnabled(); });
    await user.click(depart());
    expect(game.started).toEqual([
      {
        jobId: 'caravan-to-highcrag',
        heroIds: ['h1', 'h2'],
        caravan: {
          cargo: [
            { material: 'timber', amount: 60 },
            { material: 'ore', amount: 40 },
          ],
          staying: ['h1'],
        },
      },
    ]);
  });

  it('sends an escort with no cargo and nobody staying as a caravan all the same', async () => {
    const game = fakeGame();
    const { user } = await renderCaravan(game);
    await user.click(partyBox('Wren'));
    await waitFor(() => { expect(depart()).toBeEnabled(); });
    await user.click(depart());
    expect(game.started).toEqual([{ jobId: 'caravan-to-highcrag', heroIds: ['h1'], caravan: { cargo: [], staying: [] } }]);
  });

  it("waits with the reason while the cargo is more than the camp holds, more than the cart carries, or not a whole number", async () => {
    const { user } = await renderCaravan(fakeGame());
    await user.click(partyBox('Wren'));
    await load(user, 'ore', '41');
    expect(await screen.findByText('Millbrook holds only 40 ore.')).toBeInTheDocument();
    expect(depart()).toBeDisabled();

    await load(user, 'ore', '31');
    await load(user, 'timber', '70');
    expect(await screen.findByText('The cart carries 100 in all.')).toBeInTheDocument();
    expect(depart()).toBeDisabled();

    await load(user, 'timber', '2.5');
    expect(await screen.findByText('Each amount is a whole number, 0 or more.')).toBeInTheDocument();
    expect(depart()).toBeDisabled();

    await load(user, 'timber', '');
    await waitFor(() => { expect(depart()).toBeEnabled(); });
  });

  it("waits with the reason while more stay than Highcrag's hall has room for, and lets go of one who leaves the party", async () => {
    const { user } = await renderCaravan(fakeGame());
    for (const name of ['Wren', 'Moss', 'Lark']) await user.click(partyBox(name));
    for (const name of ['Wren', 'Moss', 'Lark']) await user.click(await screen.findByRole('checkbox', { name: `${name} stays at Highcrag` }));
    await waitFor(() => { expect(depart()).toBeDisabled(); });
    expect(panel().getAllByText("Highcrag's heroes hall has room for 2 more.")).toHaveLength(2);

    // Lark leaves the party, and with it who stays.
    await user.click(partyBox('Lark'));
    await waitFor(() => { expect(depart()).toBeEnabled(); });
    expect(panel().getAllByText("Highcrag's heroes hall has room for 2 more.")).toHaveLength(1);
  });

  // Another start or a build took the balance or the slot since the page read the camp.
  it.each([
    ['InsufficientResources', 'The camp cannot pay for the cargo now.'],
    ['HallFull', 'The heroes hall at the destination has no room for everyone who stays.'],
  ])("shows the hub's refusal %s in place, in the player's words", async (kind, words) => {
    const { user } = await renderCaravan(fakeGame(undefined, () => new Refusal(kind, kind)));
    await user.click(partyBox('Wren'));
    await waitFor(() => { expect(depart()).toBeEnabled(); });
    await user.click(depart());
    expect(await screen.findByText(words)).toHaveRole('alert');
  });

  it('says what a caravan to a location the player has not unlocked needs, in place of the picks', async () => {
    await renderCaravan(fakeGame([millbrook]));
    expect(panel().getByRole('heading', { name: 'Caravan to Highcrag', level: 2 })).toBeInTheDocument();
    expect(panel().getByText('Needs the road to Highcrag.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Depart' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Cargo' })).not.toBeInTheDocument();
  });
});
