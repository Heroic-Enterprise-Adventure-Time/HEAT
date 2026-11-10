import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { render, screen } from '@testing-library/angular/zoneless';
import userEvent from '@testing-library/user-event';

import { Game, type PlayerView } from '../game';
import { Session, type SessionUser } from '../session';
import { fakeSession, PLAYER } from '../testing/fake-session';
import { textsOf } from '../testing/texts-of';
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
      heroes: [{ heroId: 'h1', name: 'Wren', unitType: 'villager', spriteSet: 'villager-01', level: 1, stats: { maxHealth: 30, speed: 8, damage: 4, gather: [{ material: 'timber', rating: 2 }, { material: 'ore', rating: 2 }] } }],
    },
  },
};

async function renderHeader(signedIn: SessionUser | null, loaded: PlayerView | null) {
  const session = fakeSession(signedIn);
  const game = { player: signal(loaded), location: signal('millbrook') };
  const user = userEvent.setup();
  await render(Header, {
    providers: [
      provideRouter([]),
      { provide: Session, useValue: session },
      { provide: Game, useValue: game },
    ],
  });
  return { session, user };
}

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
});
