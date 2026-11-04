import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { render, screen, waitFor } from '@testing-library/angular/zoneless';
import userEvent from '@testing-library/user-event';

import { Config } from '../config';
import { Game } from '../game';
import { Session } from '../session';
import { Blank } from '../testing/blank';
import { fakeSession, PLAYER } from '../testing/fake-session';
import { Home } from './home';

/** Home itself, not in an outlet, so that it stays on the page after it sends a player on. */
async function renderHome(session: ReturnType<typeof fakeSession>, configError: string | null = null) {
  const config = new Config();
  config.error.set(configError);
  const user = userEvent.setup();
  const { fixture } = await render(Home, {
    providers: [
      provideRouter([{ path: 'camp/:location', component: Blank }]),
      { provide: Session, useValue: session },
      { provide: Config, useValue: config },
      { provide: Game, useValue: { location: signal('millbrook') } },
    ],
  });
  return { user, router: fixture.debugElement.injector.get(Router) };
}

describe('Home', () => {
  it('shows the name of the game', async () => {
    await renderHome(fakeSession(null));
    expect(screen.getByRole('heading', { name: 'HEAT', level: 1 })).toBeInTheDocument();
  });

  it('offers Google sign-in when nobody is signed in, and signs in on the click', async () => {
    const session = fakeSession(null);
    const { user } = await renderHome(session);
    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    expect(session.signedIn).toBe(1);
  });

  it('sends a signed-in player on to their camp', async () => {
    const { router } = await renderHome(fakeSession(PLAYER));
    await waitFor(() => { expect(router.url).toBe('/camp/millbrook'); });
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('says so when the stack configuration did not load', async () => {
    await renderHome(fakeSession(null), 'GET /config.json answered 404');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('The page could not load its stack configuration: GET /config.json answered 404.')).toBeInTheDocument();
  });
});
