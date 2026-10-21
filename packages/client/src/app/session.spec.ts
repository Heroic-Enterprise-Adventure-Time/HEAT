import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import type { User, UserManagerSettings } from 'oidc-client-ts';
import { Config, type StackConfig } from './config';
import { SESSION_MANAGER_FACTORY, Session, type SessionManager, inAppPath, logoutUrl, sessionSettings } from './session';

const config: StackConfig = {
  graphqlPath: '/graphql',
  userPoolId: 'us-east-1_EXAMPLE',
  clientId: '1example23456789',
  loginHost: 'https://auth.heat-sb.dcg-games.com',
  passwordSignIn: false,
};

describe('sessionSettings', () => {
  it('names the pool as the authority and the login host for the endpoints, with PKCE and Google', () => {
    const settings = sessionSettings(config, 'https://46.heat-sb.dcg-games.com');
    expect(settings.authority).toBe('https://cognito-idp.us-east-1.amazonaws.com/us-east-1_EXAMPLE');
    expect(settings.metadata?.authorization_endpoint).toBe('https://auth.heat-sb.dcg-games.com/oauth2/authorize');
    expect(settings.metadata?.token_endpoint).toBe('https://auth.heat-sb.dcg-games.com/oauth2/token');
    expect(settings.metadata?.jwks_uri).toBe('https://cognito-idp.us-east-1.amazonaws.com/us-east-1_EXAMPLE/.well-known/jwks.json');
    expect(settings.client_id).toBe('1example23456789');
    expect(settings.redirect_uri).toBe('https://46.heat-sb.dcg-games.com');
    expect(settings.response_type).toBe('code');
    expect(settings.scope).toBe('openid email profile');
    expect(settings.extraQueryParams).toEqual({ identity_provider: 'Google' });
    expect(settings.automaticSilentRenew).toBe(true);
  });

  it('shows the managed login page, with email and password beside Google, where the stack offers a password', () => {
    const settings = sessionSettings({ ...config, passwordSignIn: true }, 'https://86.heat-sb.dcg-games.com');
    expect(settings.extraQueryParams).toBeUndefined();
  });
});

describe('logoutUrl', () => {
  it("is Cognito's logout endpoint with the client and the origin as the sign-out URL", () => {
    expect(logoutUrl(config, 'http://localhost:4200')).toBe(
      'https://auth.heat-sb.dcg-games.com/logout?client_id=1example23456789&logout_uri=http%3A%2F%2Flocalhost%3A4200',
    );
  });
});

describe('inAppPath', () => {
  const origin = 'https://96.heat-sb.dcg-games.com';

  it('keeps a path of the page with its query and fragment', () => {
    expect(inAppPath('/camp/millbrook/mine', origin)).toBe('/camp/millbrook/mine');
    expect(inAppPath('/camp/millbrook/heroes-hall/heroes/h1?x=1#top', origin)).toBe('/camp/millbrook/heroes-hall/heroes/h1?x=1#top');
  });

  it('refuses anything that is not a path of this page', () => {
    for (const value of [
      '//evil.example/camp',
      '/\\evil.example/camp',
      '/\t/evil.example/camp',
      'https://evil.example/camp',
      `${origin}/camp/millbrook/mine`,
      'javascript:alert(1)',
      'camp/millbrook/mine',
      '',
      null,
      undefined,
      42,
      { path: '/camp/millbrook/mine' },
    ]) {
      expect(inAppPath(value, origin), String(value)).toBeNull();
    }
  });
});

/** A manager that records calls and answers with a given user. */
function fakeManager(user: User | null) {
  const handlers: Record<string, ((...args: never[]) => void)[]> = {};
  const fake = {
    settings: null as UserManagerSettings | null,
    calls: [] as string[],
    getUser: async () => user,
    signinRedirect: async (args?: unknown) => void fake.calls.push(args ? `signinRedirect ${JSON.stringify(args)}` : 'signinRedirect'),
    signinCallback: async (url?: string) => {
      fake.calls.push(`signinCallback ${url}`);
      return user ?? undefined;
    },
    removeUser: async () => void fake.calls.push('removeUser'),
    events: {
      addUserLoaded: (h: (u: User) => void) => void (handlers['loaded'] = [...(handlers['loaded'] ?? []), h]),
      addUserUnloaded: (h: () => void) => void (handlers['unloaded'] = [...(handlers['unloaded'] ?? []), h]),
      addSilentRenewError: (h: (e: Error) => void) => void (handlers['renewError'] = [...(handlers['renewError'] ?? []), h]),
    },
    handlers,
  };
  return fake;
}

function signedInUser(state?: unknown): User {
  return { expired: false, access_token: 'access', profile: { email: 'player@example.com', name: 'Player' }, state } as unknown as User;
}

async function sessionWith(manager: ReturnType<typeof fakeManager>, loaded: StackConfig | null, href: string) {
  const location = new URL(href);
  const navigations: string[] = [];
  const replaced: string[] = [];
  const document = {
    location: { origin: location.origin, search: location.search, href: location.href, pathname: location.pathname, assign: (url: string) => navigations.push(url) },
    defaultView: { history: { replaceState: (_s: unknown, _t: string, url: string) => replaced.push(url) } },
  };
  const configService = new Config();
  configService.value.set(loaded);
  TestBed.configureTestingModule({
    providers: [
      { provide: Config, useValue: configService },
      { provide: DOCUMENT, useValue: document },
      {
        provide: SESSION_MANAGER_FACTORY,
        useValue: (settings: UserManagerSettings): SessionManager => {
          manager.settings = settings;
          return manager as unknown as SessionManager;
        },
      },
    ],
  });
  const session = TestBed.inject(Session);
  await session.start();
  return { session, navigations, replaced };
}

describe('Session', () => {
  it('is unavailable without the stack configuration', async () => {
    const manager = fakeManager(null);
    const { session } = await sessionWith(manager, null, 'https://46.heat-sb.dcg-games.com/');
    expect(session.user()).toBeNull();
    expect(session.error()).toContain('configuration did not load');
    expect(manager.settings).toBeNull();
  });

  it('starts signed out and signs in through the manager', async () => {
    const manager = fakeManager(null);
    const { session } = await sessionWith(manager, config, 'https://46.heat-sb.dcg-games.com/');
    expect(session.user()).toBeNull();
    expect(manager.settings?.redirect_uri).toBe('https://46.heat-sb.dcg-games.com');
    await session.signIn();
    expect(manager.calls).toEqual(['signinRedirect']);
  });

  it('labels the sign-in button for Google, or plainly where the login page offers a password', async () => {
    const google = await sessionWith(fakeManager(null), config, 'https://46.heat-sb.dcg-games.com/');
    expect(google.session.signInLabel).toBe('Sign in with Google');
    TestBed.resetTestingModule();
    const password = await sessionWith(fakeManager(null), { ...config, passwordSignIn: true }, 'https://86.heat-sb.dcg-games.com/');
    expect(password.session.signInLabel).toBe('Sign in');
  });

  it('exchanges the code of a redirect, removes the query, and knows the player', async () => {
    const manager = fakeManager(signedInUser());
    const href = 'https://46.heat-sb.dcg-games.com/?code=abc&state=xyz';
    const { session, replaced } = await sessionWith(manager, config, href);
    expect(manager.calls).toEqual([`signinCallback ${href}`]);
    expect(replaced).toEqual(['/']);
    expect(session.user()).toEqual({ email: 'player@example.com', name: 'Player', accessToken: 'access' });
  });

  it('sends a kept path through sign-in as the custom state, and nothing else', async () => {
    const manager = fakeManager(null);
    const { session } = await sessionWith(manager, config, 'https://46.heat-sb.dcg-games.com/');
    session.keep('//evil.example/camp');
    await session.signIn();
    session.keep('/camp/millbrook/mine');
    await session.signIn();
    expect(manager.calls).toEqual(['signinRedirect', 'signinRedirect {"state":"/camp/millbrook/mine"}']);
  });

  it('returns to the path kept at sign-in after the redirect', async () => {
    const manager = fakeManager(signedInUser('/camp/millbrook/mine'));
    const { session, replaced } = await sessionWith(manager, config, 'https://46.heat-sb.dcg-games.com/?code=abc&state=xyz');
    expect(replaced).toEqual(['/camp/millbrook/mine']);
    expect(session.user()?.email).toBe('player@example.com');
  });

  it('refuses a returned state that is not a path of the page', async () => {
    const manager = fakeManager(signedInUser('https://evil.example/camp'));
    const { replaced } = await sessionWith(manager, config, 'https://46.heat-sb.dcg-games.com/?code=abc&state=xyz');
    expect(replaced).toEqual(['/']);
  });

  it('reports a refused sign-in from the redirect', async () => {
    const manager = fakeManager(null);
    const { session, replaced } = await sessionWith(manager, config, 'http://localhost:4200/?error=access_denied&error_description=Declined');
    expect(session.error()).toBe('sign-in failed: Declined');
    expect(replaced).toEqual(['/']);
  });

  it('follows the manager when the player signs out elsewhere or the renewal fails', async () => {
    const manager = fakeManager(signedInUser());
    const { session } = await sessionWith(manager, config, 'https://46.heat-sb.dcg-games.com/');
    expect(session.user()?.email).toBe('player@example.com');
    manager.handlers['unloaded']?.forEach((h) => h());
    expect(session.user()).toBeNull();
    manager.handlers['loaded']?.forEach((h) => (h as (u: User) => void)(signedInUser()));
    expect(session.user()?.email).toBe('player@example.com');
    manager.handlers['renewError']?.forEach((h) => (h as (e: Error) => void)(new Error('invalid_grant')));
    expect(session.user()).toBeNull();
    expect(session.error()).toBe('the session could not be renewed: invalid_grant');
  });

  it("signs out by forgetting the tokens and leaving through Cognito's logout endpoint", async () => {
    const manager = fakeManager(signedInUser());
    const { session, navigations } = await sessionWith(manager, config, 'http://localhost:4200/');
    await session.signOut();
    expect(manager.calls).toEqual(['removeUser']);
    expect(navigations).toEqual([
      'https://auth.heat-sb.dcg-games.com/logout?client_id=1example23456789&logout_uri=http%3A%2F%2Flocalhost%3A4200',
    ]);
  });
});
