import { signal } from '@angular/core';
import { render, screen } from '@testing-library/angular';
import userEvent from '@testing-library/user-event';

import { Game, type PlayerView } from '../game';
import { Session, type SessionUser } from '../session';
import { Header } from './header';

const player: PlayerView = {
  id: 'p1',
  camps: [{ location: 'millbrook', name: 'Millbrook', hallLevel: 1, heroCapacity: 4, activeHeroes: 0, livingHeroes: 0, holdings: [], resourceCapacity: 100, warehouseLevel: 1, facilities: [] }],
  heroes: [],
  openAdventure: {
    id: 'a1',
    startedAt: '2026-10-20T07:00:00.000Z',
    location: 'millbrook',
    seed: 's1',
    version: 'v1',
    job: { id: 'wolves-on-the-mill-road', name: 'Wolves on the mill road', description: 'Two wolves.' },
    snapshot: {
      version: 'v1',
      jobId: 'wolves-on-the-mill-road',
      heroes: [{ heroId: 'h1', name: 'Wren', unitType: 'villager', spriteSet: 'villager-01', level: 1, stats: { maxHealth: 30, speed: 8, damage: 4, gathering: 4 } }],
    },
  },
};

async function renderHeader(user: SessionUser | null, loaded: PlayerView | null) {
  const session = {
    user: signal(user),
    signInLabel: 'Sign in with Google',
    signedIn: 0,
    signedOut: 0,
    signIn: () => {
      session.signedIn++;
      return Promise.resolve();
    },
    signOut: () => {
      session.signedOut++;
      return Promise.resolve();
    },
  };
  const game = { player: signal(loaded), location: signal('millbrook') };
  await render(Header, {
    routes: [],
    providers: [
      { provide: Session, useValue: session },
      { provide: Game, useValue: game },
    ],
  });
  return { session };
}

describe('Header', () => {
  it('shows the title and Google sign-in to a visitor', async () => {
    const { session } = await renderHeader(null, null);
    expect(screen.getByText('HEAT')).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Camp' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    expect(session.signedIn).toBe(1);
  });

  it('shows a signed-in player their camps, a link to the open adventure and sign-out', async () => {
    const { session } = await renderHeader({ email: 'player@example.com', name: null, accessToken: 't' }, player);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Millbrook']);
    expect(screen.getByRole<HTMLAnchorElement>('link', { name: 'Adventure in progress' }).getAttribute('href')).toBe('/adventure');
    expect(screen.getByText('player@example.com')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(session.signedOut).toBe(1);
  });
});
