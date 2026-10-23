import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { Config } from '../config';
import { Session, type SessionUser } from '../session';
import { CAMP_SCENE_FACTORY } from '../camp/camp';
import { Game } from '../game';
import { Home } from './home';

@Component({ template: '' })
class Stub {}

/** A session with a settable user and recorded actions, in place of the real one. */
function fakeSession(user: SessionUser | null) {
  const fake = {
    user: signal(user),
    signInLabel: 'Sign in with Google',
    error: signal<string | null>(null),
    signedIn: 0,
    signedOut: 0,
    signIn: async () => void fake.signedIn++,
    signOut: async () => void fake.signedOut++,
  };
  return fake;
}

async function render(session: ReturnType<typeof fakeSession>, configError: string | null = null) {
  const config = new Config();
  config.error.set(configError);
  await TestBed.configureTestingModule({
    imports: [Home],
    providers: [
      provideRouter([{ path: 'camp/:location', component: Stub }]),
      { provide: Session, useValue: session },
      { provide: Config, useValue: config },
      // The camp's own collaborators, standing in: no hub and no WebGL in a test.
      { provide: Game, useValue: { heroesHere: signal([]), location: signal('millbrook'), camp: signal(null), recruits: signal([]), busy: signal(false), error: signal(null) } },
      { provide: CAMP_SCENE_FACTORY, useValue: async () => ({ setHeroes: () => undefined, setLevels: () => undefined, destroy: () => undefined }) },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(Home);
  await fixture.whenStable();
  return { fixture, page: fixture.nativeElement as HTMLElement };
}

describe('Home', () => {
  it('shows the name of the game', async () => {
    const { page } = await render(fakeSession(null));
    expect(page.querySelector('h1')?.textContent).toBe('HEAT');
  });

  it('offers Google sign-in when nobody is signed in, and signs in on the click', async () => {
    const session = fakeSession(null);
    const { page } = await render(session);
    const button = page.querySelector('button');
    expect(button?.textContent).toBe('Sign in with Google');
    button?.click();
    expect(session.signedIn).toBe(1);
  });

  it('sends a signed-in player on to their camp', async () => {
    const session = fakeSession({ email: 'player@example.com', name: 'Player', accessToken: 'token' });
    const { page } = await render(session);
    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/camp/millbrook'));
    expect(page.querySelector('h1')).toBeNull();
  });

  it('says so when the stack configuration did not load', async () => {
    const { page } = await render(fakeSession(null), 'GET /config.json answered 404');
    expect(page.querySelector('button')).toBeNull();
    expect(page.textContent).toContain('could not load its stack configuration: GET /config.json answered 404');
  });
});
