import { signal } from '@angular/core';
import { screen, waitFor } from '@testing-library/angular/zoneless';
import userEvent from '@testing-library/user-event';

import { CAMP_SCENE_FACTORY } from '../camp/camp';
import { Config } from '../config';
import { Game } from '../game';
import { Session } from '../session';
import { Blank } from '../testing/blank';
import { fakeCampScene } from '../testing/fake-camp-scene';
import { fakeSession, PLAYER } from '../testing/fake-session';
import { testLayoutSizes } from '../testing/layout-sizes';
import { renderAt } from '../testing/render-at';
import { Home } from './home';

function renderHome(session: ReturnType<typeof fakeSession>, configError: string | null = null) {
  const config = new Config();
  config.error.set(configError);
  return renderAt(
    '/',
    [
      { path: '', component: Home },
      { path: 'camp/:location', component: Blank },
    ],
    [
      { provide: Session, useValue: session },
      { provide: Config, useValue: config },
      // The camp's own collaborators, standing in: no hub and no WebGL in a test.
      { provide: Game, useValue: { heroesHere: signal([]), location: signal('millbrook'), camp: signal(null), recruits: signal([]), error: signal(null) } },
      { provide: CAMP_SCENE_FACTORY, useValue: fakeCampScene },
      testLayoutSizes,
    ],
  );
}

describe('Home', () => {
  it('shows the name of the game', async () => {
    await renderHome(fakeSession(null));
    expect(screen.getByRole('heading', { name: 'HEAT', level: 1 })).toBeInTheDocument();
  });

  it('offers Google sign-in when nobody is signed in, and signs in on the click', async () => {
    const session = fakeSession(null);
    await renderHome(session);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
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
    expect(screen.getByText(/could not load its stack configuration: GET \/config\.json answered 404/)).toBeInTheDocument();
  });
});
