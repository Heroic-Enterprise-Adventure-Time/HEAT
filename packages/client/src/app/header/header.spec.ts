import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { render, screen, waitFor } from '@testing-library/angular/zoneless';
import userEvent from '@testing-library/user-event';

import { must, UNIT_PROFILES } from '@heat/engine';

import { Game, type PlayerView } from '../game';
import { Session, type SessionUser } from '../session';
import { Blank } from '../testing/blank';
import { fakeSession, PLAYER } from '../testing/fake-session';
import { textsOf } from '../testing/texts-of';
import { withHighcrag } from '../testing/with-highcrag';
import { Header } from './header';

const player: PlayerView = {
  id: 'p1',
  camps: [{ location: 'millbrook', name: 'Millbrook', hallLevel: 1, heroCapacity: 4, activeHeroes: 0, livingHeroes: 0, holdings: [], resourceCapacity: 100, warehouseLevel: 1, facilities: [] }],
  heroes: [],
  unlocks: [],
  openAdventure: {
    id: 'a1',
    startedAt: '2026-10-20T07:00:00.000Z',
    location: 'millbrook',
    seed: 's1',
    version: 'v1',
    caravan: null,
    job: { id: 'wolves-on-the-mill-road', name: 'Wolves on the mill road', description: 'Two wolves.' },
    snapshot: {
      version: 'v1',
      jobId: 'wolves-on-the-mill-road',
      heroes: [{ heroId: 'h1', name: 'Wren', unitType: 'villager', spriteSet: 'villager-01', level: 1, stats: must(UNIT_PROFILES.villager, 'the villager profile').stats }],
    },
  },
};

async function renderHeader(signedIn: SessionUser | null, loaded: PlayerView | null, at = 'millbrook') {
  const session = fakeSession(signedIn);
  const game = { player: signal(loaded), location: signal(at) };
  const user = userEvent.setup();
  const { fixture } = await render(Header, {
    providers: [
      provideRouter([{ path: 'camp/:location', component: Blank }]),
      { provide: Session, useValue: session },
      { provide: Game, useValue: game },
    ],
  });
  return { session, user, router: fixture.debugElement.injector.get(Router) };
}

const campSelect = () => screen.getByRole('combobox', { name: 'Camp' });

describe('Header', () => {
  it('shows the title and Google sign-in to a visitor', async () => {
    const { session, user } = await renderHeader(null, null);
    expect(screen.getByText('HEAT')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    expect(session.signedIn).toBe(1);
  });

  it('shows a signed-in player their camps, a link to the open adventure and sign-out', async () => {
    const { session, user } = await renderHeader(PLAYER, player);
    expect(textsOf(screen.getAllByRole('option'))).toEqual(['Millbrook']);
    expect(screen.getByRole('link', { name: 'Adventure in progress' })).toHaveAttribute('href', '/adventure');
    expect(screen.getByText('player@example.com')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(session.signedOut).toBe(1);
  });

  it('lists Highcrag once the player has a camp there, and goes to the camp chosen (Issue-352)', async () => {
    const { user, router } = await renderHeader(PLAYER, withHighcrag(player));
    expect(textsOf(screen.getAllByRole('option'))).toEqual(['Millbrook', 'Highcrag']);
    expect(campSelect()).toHaveValue('millbrook');
    await user.selectOptions(campSelect(), 'Highcrag');
    await waitFor(() => { expect(router.url).toBe('/camp/highcrag'); });
  });

  it('shows the camp on screen as the one selected, the second as well as the first', async () => {
    await renderHeader(PLAYER, withHighcrag(player), 'highcrag');
    expect(campSelect()).toHaveValue('highcrag');
    expect(screen.getByRole('option', { name: 'Highcrag', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Millbrook', selected: false })).toBeInTheDocument();
  });
});
