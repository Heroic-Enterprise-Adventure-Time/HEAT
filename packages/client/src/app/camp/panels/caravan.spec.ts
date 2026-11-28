import { computed, signal } from '@angular/core';
import { screen, waitFor, within } from '@testing-library/angular/zoneless';

import { JOBS } from '@heat/engine';

import { BATTLE_SCENE_FACTORY } from '../../adventure/battle-view';
import { routes } from '../../app.routes';
import { FRAME_LOOP } from '../../frame-loop';
import { type AdventureView, type CampView, type CaravanStart, Game, type HeroView } from '../../game';
import { Refusal } from '../../hub';
import { Session } from '../../session';
import { CARAVAN_DESTINATION as highcrag, CARAVAN_ORIGIN as millbrook } from '../../testing/caravan-camps';
import { fakeCampScene } from '../../testing/fake-camp-scene';
import { fakeIcons } from '../../testing/fake-icons';
import { fakeSession, PLAYER } from '../../testing/fake-session';
import { testLayoutSizes } from '../../testing/layout-sizes';
import { depart, panel } from '../../testing/page';
import { renderAt } from '../../testing/render-at';
import { wordsOf } from '../../testing/texts-of';
import { CAMP_SCENE_FACTORY } from '../camp';
import { saveLastParty } from './last-party';

function hero(id: string, name: string): HeroView {
  return { id, name, unitType: 'fighter', spriteSet: 'fighter-02', location: 'millbrook', recruitedAt: '2026-10-20T07:00:00.000Z', level: 2, xp: 30, status: 'ALIVE', retiredAt: null };
}

const party = [hero('h1', 'Wren'), hero('h2', 'Moss'), hero('h3', 'Lark')];

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
const group = (name: string) => within(screen.getByRole('group', { name }));
const partyTile = (name: string) => group('Party').getByRole('button', { name });
const stays = (name: string) => group('Who stays at Highcrag').getByRole('button', { name });
/** The two groups of who stays (Issue-391): the party's heroes, and everyone else here, who would ride along. */
const ofTheParty = () => group('Of the party');
const riding = () => group('Riding along');
/** The heroes a group offers a tile for, by name, in the camp's order. */
const tilesOf = (offered: 'Of the party' | 'Riding along') => party.map((h) => h.name).filter((name) => group(offered).queryByRole('button', { name }) !== null);
/** One of a resource's stepper buttons, "+10" or "−1". */
const step = (label: string, material: string) => group('Cargo').getByRole('button', { name: `${label} ${material}` });
/** The amount a resource's stepper shows, as a reader hears its chip. */
const amountOf = (material: string) => wordsOf([group(material).getByRole('status')])[0];
const cargo = () => screen.getByRole('group', { name: 'Cargo' });

describe("A caravan's page (Issue-355)", () => {
  it('opens with the last party sent on it picked, and with no cargo and nobody marked to stay (Issue-440)', async () => {
    saveLastParty('millbrook', 'caravan-to-highcrag', ['h1', 'h3']);
    await renderCaravan(fakeGame());
    expect(partyTile('Wren')).toHaveAttribute('aria-pressed', 'true');
    expect(partyTile('Moss')).toHaveAttribute('aria-pressed', 'false');
    expect(tilesOf('Of the party')).toEqual(['Wren', 'Lark']);
    expect(stays('Wren')).toHaveAttribute('aria-pressed', 'false');
    expect(stays('Lark')).toHaveAttribute('aria-pressed', 'false');
    expect(amountOf('timber')).toBe('timber 0');
  });

  it('starts again with no cargo and nobody marked to stay when the player comes back from another job, as the party does (PR-442)', async () => {
    const { router, user } = await renderCaravan(fakeGame());
    await user.click(partyTile('Wren'));
    await waitFor(() => { expect(tilesOf('Of the party')).toEqual(['Wren']); });
    await user.click(stays('Wren'));
    await user.click(step('+1', 'timber'));
    await waitFor(() => { expect(amountOf('timber')).toBe('timber 1'); });
    expect(stays('Wren')).toHaveAttribute('aria-pressed', 'true');

    // A job of another facility is the same route, so the page is the same one and only what it follows changes.
    await router.navigateByUrl('/camp/millbrook/mine/jobs/ore-from-the-hill');
    await waitFor(() => { expect(screen.queryByRole('heading', { name: 'Caravan to Highcrag', level: 2 })).not.toBeInTheDocument(); });
    await router.navigateByUrl(CARAVAN);
    expect(await screen.findByRole('heading', { name: 'Caravan to Highcrag', level: 2 })).toBeInTheDocument();
    // Nobody was sent on it, so the party is empty again; a mark that outlived it would send Wren as a rider.
    expect(partyTile('Wren')).toHaveAttribute('aria-pressed', 'false');
    expect(tilesOf('Riding along')).toEqual(['Wren', 'Moss', 'Lark']);
    expect(stays('Wren')).toHaveAttribute('aria-pressed', 'false');
    expect(amountOf('timber')).toBe('timber 0');
  });

  it("offers each resource the camp holds, beside its balance and Highcrag's room for it, against what the cart carries", async () => {
    await renderCaravan(fakeGame());
    expect(panel().getByRole('heading', { name: 'Caravan to Highcrag', level: 2 })).toBeInTheDocument();
    expect(panel().getByText(JOBS['caravan-to-highcrag'].description)).toBeInTheDocument();
    expect(cargo()).toHaveAccessibleDescription('Cargo: 0 of the 100 the cart carries.');
    expect(panel().getByText('Millbrook holds 90; room for 100 at Highcrag')).toBeInTheDocument();
    expect(panel().getByText('Millbrook holds 40; room for 30 at Highcrag')).toBeInTheDocument();
    expect(amountOf('timber')).toBe('timber 0');
    expect(step('−1', 'timber')).toBeDisabled();
    expect(step('+1', 'timber')).toBeEnabled();
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

  it("offers who stays in two groups, as tiles, beside Highcrag's free slots: the party's, and everyone else here, who would ride along (Issue-391)", async () => {
    const { user } = await renderCaravan(fakeGame());
    const staying = screen.getByRole('group', { name: 'Who stays at Highcrag' });
    expect(staying).toHaveAccessibleDescription("Highcrag's heroes hall has room for 2 more.");
    expect(tilesOf('Of the party')).toEqual([]);
    expect(ofTheParty().getByText('Pick the party first.')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Riding along' })).toHaveAccessibleDescription('A rider stays without fighting on the way.');
    expect(tilesOf('Riding along')).toEqual(['Wren', 'Moss', 'Lark']);

    await user.click(partyTile('Wren'));
    await user.click(partyTile('Lark'));
    await waitFor(() => { expect(tilesOf('Of the party')).toEqual(['Wren', 'Lark']); });
    expect(tilesOf('Riding along')).toEqual(['Moss']);
    expect(stays('Wren')).toHaveAttribute('aria-pressed', 'false');
    await user.click(stays('Wren'));
    expect(stays('Wren')).toHaveAttribute('aria-pressed', 'true');

    // With everyone in the party, nobody is left to ride.
    await user.click(partyTile('Moss'));
    await waitFor(() => { expect(tilesOf('Riding along')).toEqual([]); });
    expect(riding().getByText('Nobody else is here to ride.')).toBeInTheDocument();
  });

  it('Departs with a rider among who stays and not in the party', async () => {
    const game = fakeGame();
    const { user } = await renderCaravan(game);
    await user.click(partyTile('Wren'));
    await user.click(riding().getByRole('button', { name: 'Lark' }));
    await waitFor(() => { expect(riding().getByRole('button', { name: 'Lark' })).toHaveAttribute('aria-pressed', 'true'); });
    await user.click(depart());
    expect(game.started[0]).toMatchObject({ heroIds: ['h1'], caravan: { staying: ['h3'] } });
  });

  it('keeps the mark of a rider picked into the party, who then stays as one of it, and lets go of it when it leaves the party', async () => {
    const game = fakeGame();
    const { user } = await renderCaravan(game);
    await user.click(partyTile('Wren'));
    await user.click(riding().getByRole('button', { name: 'Lark' }));
    await user.click(partyTile('Lark'));
    await waitFor(() => { expect(ofTheParty().getByRole('button', { name: 'Lark' })).toHaveAttribute('aria-pressed', 'true'); });

    // Leaving the party is leaving the caravan: Lark does not become a rider by it.
    await user.click(partyTile('Lark'));
    await waitFor(() => { expect(riding().getByRole('button', { name: 'Lark' })).toHaveAttribute('aria-pressed', 'false'); });
    await user.click(depart());
    expect(game.started[0]).toMatchObject({ heroIds: ['h1'], caravan: { staying: [] } });
  });

  it('Departs with the cargo picked and who stays, leaving out a resource at 0', async () => {
    const game = fakeGame();
    const { user } = await renderCaravan(game);
    await user.click(partyTile('Wren'));
    await user.click(partyTile('Moss'));
    await user.click(step('+100', 'ore'));
    await user.click(step('+100', 'timber'));
    await waitFor(() => { expect(stays('Wren')).toBeInTheDocument(); });
    await user.click(stays('Wren'));
    await waitFor(() => { expect(cargo()).toHaveAccessibleDescription('Cargo: 100 of the 100 the cart carries.'); });
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
    await user.click(partyTile('Wren'));
    await waitFor(() => { expect(depart()).toBeEnabled(); });
    await user.click(depart());
    expect(game.started).toEqual([{ jobId: 'caravan-to-highcrag', heroIds: ['h1'], caravan: { cargo: [], staying: [] } }]);
  });

  it('clamps a step to what the camp holds and what the cart has left, and never below 0, so a cargo is never refused for its amounts (Issue-386)', async () => {
    const game = fakeGame();
    const { user } = await renderCaravan(game);
    await user.click(partyTile('Wren'));
    await user.click(step('+100', 'ore'));
    await waitFor(() => { expect(amountOf('ore')).toBe('ore 40'); });
    expect(step('+1', 'ore')).toBeDisabled();

    await user.click(step('+100', 'timber'));
    await waitFor(() => { expect(amountOf('timber')).toBe('timber 60'); });
    expect(step('+1', 'timber')).toBeDisabled();
    await user.click(step('−10', 'timber'));
    await waitFor(() => { expect(amountOf('timber')).toBe('timber 50'); });
    expect(step('+1', 'timber')).toBeEnabled();

    await user.click(step('−100', 'ore'));
    await waitFor(() => { expect(amountOf('ore')).toBe('ore 0'); });
    expect(cargo()).toHaveAccessibleDescription('Cargo: 50 of the 100 the cart carries.');
    expect(depart()).toBeEnabled();
    await user.click(depart());
    expect(game.started[0]?.caravan?.cargo).toEqual([{ material: 'timber', amount: 50 }]);
  });

  it("waits with the reason while more stay than Highcrag's hall has room for, and lets go of one who leaves the party", async () => {
    const { user } = await renderCaravan(fakeGame());
    for (const name of ['Wren', 'Moss', 'Lark']) await user.click(partyTile(name));
    for (const name of ['Wren', 'Moss', 'Lark']) {
      await waitFor(() => { expect(stays(name)).toBeInTheDocument(); });
      await user.click(stays(name));
    }
    await waitFor(() => { expect(depart()).toBeDisabled(); });
    expect(panel().getAllByText("Highcrag's heroes hall has room for 2 more.")).toHaveLength(2);

    // Lark leaves the party, and with it who stays.
    await user.click(partyTile('Lark'));
    await waitFor(() => { expect(depart()).toBeEnabled(); });
    expect(panel().getAllByText("Highcrag's heroes hall has room for 2 more.")).toHaveLength(1);
  });

  // Another start or a build took the balance or the slot since the page read the camp.
  it.each([
    ['InsufficientResources', 'The camp cannot pay for the cargo now.'],
    ['HallFull', 'The heroes hall at the destination has no room for everyone who stays.'],
  ])("shows the hub's refusal %s in place, in the player's words", async (kind, words) => {
    const { user } = await renderCaravan(fakeGame(undefined, () => new Refusal(kind, kind)));
    await user.click(partyTile('Wren'));
    await waitFor(() => { expect(depart()).toBeEnabled(); });
    await user.click(depart());
    expect(await screen.findByText(words)).toHaveRole('alert');
  });

  it('says what a caravan to a location the player has not unlocked needs, in place of the picks', async () => {
    await renderCaravan(fakeGame([millbrook]));
    expect(panel().getByRole('heading', { name: 'Caravan to Highcrag', level: 2 })).toBeInTheDocument();
    expect(panel().getByText('Needs the road to Highcrag.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Depart' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Cargo' })).not.toBeInTheDocument();
  });
});
