import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Game, type PlayerView } from '../game';
import { Session, type SessionUser } from '../session';
import { Header } from './header';

const player: PlayerView = {
  id: 'p1',
  camps: [{ location: 'millbrook', name: 'Millbrook', hallLevel: 1, heroCapacity: 4, activeHeroes: 0, livingHeroes: 0, holdings: [], resourceCapacity: 100 }],
  heroes: [],
  openAdventure: {
    id: 'a1',
    startedAt: '2026-10-20T07:00:00.000Z',
    location: 'millbrook',
    job: { id: 'wolves-on-the-mill-road', name: 'Wolves on the mill road', description: 'Two wolves.' },
    snapshot: { heroes: [{ heroId: 'h1', name: 'Wren', unitType: 'villager', spriteSet: 'villager-01', level: 1 }] },
  },
};

async function render(user: SessionUser | null, loaded: PlayerView | null) {
  const session = { user: signal(user), signInLabel: 'Sign in with Google', signedIn: 0, signedOut: 0, signIn: async () => void session.signedIn++, signOut: async () => void session.signedOut++ };
  const game = { player: signal(loaded), location: signal('millbrook') };
  await TestBed.configureTestingModule({
    imports: [Header],
    providers: [
      provideRouter([]),
      { provide: Session, useValue: session },
      { provide: Game, useValue: game },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(Header);
  await fixture.whenStable();
  return { session, page: fixture.nativeElement as HTMLElement };
}

describe('Header', () => {
  it('shows the title and Google sign-in to a visitor', async () => {
    const { session, page } = await render(null, null);
    expect(page.querySelector('.title')?.textContent).toBe('HEAT');
    expect(page.querySelector('select')).toBeNull();
    page.querySelector('button')?.click();
    expect(session.signedIn).toBe(1);
  });

  it('shows a signed-in player their camps, a link to the open adventure and sign-out', async () => {
    const { session, page } = await render({ email: 'player@example.com', name: null, accessToken: 't' }, player);
    expect([...page.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Millbrook']);
    expect(page.querySelector('.adventure')?.textContent).toBe('Adventure in progress');
    expect(page.querySelector('.adventure')?.getAttribute('href')).toBe('/adventure');
    expect(page.querySelector('.who')?.textContent).toBe('player@example.com');
    page.querySelector('button')?.click();
    expect(session.signedOut).toBe(1);
  });
});
