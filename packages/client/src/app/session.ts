import { DOCUMENT } from '@angular/common';
import { Service, InjectionToken, inject, signal } from '@angular/core';
import { UserManager, type User, type UserManagerSettings } from 'oidc-client-ts';
import { Config, type StackConfig } from './config';

/**
 * Who is signed in. The email and name come from the ID token's claims, which
 * Google supplies and the pool maps (`terraform/modules/base/sign_in.tf`);
 * the access token is what the API calls carry from Issue-15 on.
 */
export interface SessionUser {
  readonly email: string | null;
  readonly name: string | null;
  readonly accessToken: string;
}

/**
 * The OpenID Connect settings for the stack's browser client (decision 0024).
 *
 * The authority is the pool's issuer, which is what the tokens name and
 * what the API's JWT authorizer verifies against; the endpoints are the
 * pool's managed login host, so no discovery request is made. The grant is
 * the authorization code with PKCE, which the library performs; the token
 * endpoint allows the browser's cross-origin exchange. Where Google is the
 * client's only provider, `identity_provider=Google` skips a login page whose
 * one control would be a Google button; where the stack also offers email and
 * password (`passwordSignIn`, a sandbox stack, Issue-86), the parameter is
 * left out and the managed login page shows both. Tokens live in session storage, the
 * library's default: gone with the tab, never shared between origins. The
 * library renews them with the refresh token before they expire, and the
 * pool rotates the refresh token on every renewal.
 */
export function sessionSettings(config: StackConfig, origin: string): UserManagerSettings {
  const region = config.userPoolId.split('_')[0];
  const authority = `https://cognito-idp.${region}.amazonaws.com/${config.userPoolId}`;
  return {
    authority,
    metadata: {
      issuer: authority,
      authorization_endpoint: `${config.loginHost}/oauth2/authorize`,
      token_endpoint: `${config.loginHost}/oauth2/token`,
      userinfo_endpoint: `${config.loginHost}/oauth2/userInfo`,
      revocation_endpoint: `${config.loginHost}/oauth2/revoke`,
      end_session_endpoint: `${config.loginHost}/logout`,
      jwks_uri: `${authority}/.well-known/jwks.json`,
    },
    client_id: config.clientId,
    redirect_uri: origin,
    post_logout_redirect_uri: origin,
    response_type: 'code',
    scope: 'openid email profile',
    ...(config.passwordSignIn ? {} : { extraQueryParams: { identity_provider: 'Google' } }),
    automaticSilentRenew: true,
    loadUserInfo: false,
  };
}

/**
 * Cognito's sign-out, which the library's generic one does not match: the
 * logout endpoint takes `client_id` and `logout_uri`, and the URI must be one
 * of the client's registered sign-out URLs, here the page's origin. It
 * clears the managed login session cookie and sends the browser back.
 */
export function logoutUrl(config: StackConfig, origin: string): string {
  const query = new URLSearchParams({ client_id: config.clientId, logout_uri: origin });
  return `${config.loginHost}/logout?${query.toString()}`;
}

/** The part of the library the session uses, so that a test can stand it in. */
export type SessionManager = Pick<UserManager, 'getUser' | 'signinRedirect' | 'signinCallback' | 'removeUser' | 'events'>;

/** How the session gets its manager; a test provides a fake. */
export const SESSION_MANAGER_FACTORY = new InjectionToken<(settings: UserManagerSettings) => SessionManager>('heat.session.manager', {
  providedIn: 'root',
  factory: () => (settings) => new UserManager(settings),
});

/**
 * The value as a path of this page, with its query and fragment, or null if
 * it is anything else: not a string, not starting with one `/` (`//host` and
 * `/\host` name another host to a browser), or resolving to another origin.
 * Sign-in returns only to what this lets through (Issue-96).
 */
export function inAppPath(value: unknown, origin: string): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  let url: URL;
  try {
    url = new URL(value, origin);
  } catch {
    return null;
  }
  return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : null;
}

function toSessionUser(user: User | null): SessionUser | null {
  if (!user || user.expired) return null;
  const email = user.profile.email;
  const name = user.profile.name;
  return {
    email: typeof email === 'string' ? email : null,
    name: typeof name === 'string' ? name : null,
    accessToken: user.access_token,
  };
}

/**
 * The signed-in state of the page, as a signal, and the two actions. Started
 * once by the application initializer after the configuration is loaded:
 * if the page was opened by the managed login's redirect, the code in the
 * query is exchanged for tokens and the address replaced by the path kept
 * at sign-in, or by the bare path; then whoever the
 * stored tokens belong to is the user.
 */
@Service()
export class Session {
  private readonly config = inject(Config);
  private readonly document = inject(DOCUMENT);
  private readonly createManager = inject(SESSION_MANAGER_FACTORY);
  private manager: SessionManager | null = null;
  private kept: string | null = null;

  readonly user = signal<SessionUser | null>(null);
  /** Why sign-in is unavailable, or the last sign-in error. */
  readonly error = signal<string | null>(null);

  /** What the sign-in button says: Google, unless the login page offers a password too. */
  get signInLabel(): string {
    return this.config.value()?.passwordSignIn ? 'Sign in' : 'Sign in with Google';
  }

  get origin(): string {
    return this.document.location.origin;
  }

  async start(): Promise<void> {
    const config = this.config.value();
    if (!config) {
      this.error.set('sign-in is unavailable: the stack configuration did not load');
      return;
    }
    const manager = this.createManager(sessionSettings(config, this.origin));
    this.manager = manager;
    manager.events.addUserLoaded((user) => { this.user.set(toSessionUser(user)); });
    manager.events.addUserUnloaded(() => { this.user.set(null); });
    manager.events.addSilentRenewError((e) => {
      this.user.set(null);
      this.error.set(`the session could not be renewed: ${e.message}`);
    });

    const query = new URLSearchParams(this.document.location.search);
    if (query.has('code') && query.has('state')) {
      let returnTo: string | null = null;
      try {
        const user = await manager.signinCallback(this.document.location.href);
        returnTo = inAppPath(user?.state, this.origin);
      } catch (e) {
        this.error.set(`sign-in failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      // The router's first navigation follows the initializer, so it reads
      // the kept path from the address bar.
      this.document.defaultView?.history.replaceState({}, '', returnTo ?? this.document.location.pathname);
    } else if (query.has('error')) {
      this.error.set(`sign-in failed: ${query.get('error_description') ?? query.get('error')}`);
      this.document.defaultView?.history.replaceState({}, '', this.document.location.pathname);
    }

    this.user.set(toSessionUser(await manager.getUser()));
  }

  /** Keeps a path that a signed-out player opened, for sign-in to return to. */
  keep(path: string): void {
    this.kept = inAppPath(path, this.origin);
  }

  /**
   * Sends the browser to the pool's managed login, or straight on to Google.
   * A kept path goes as the library's custom state, which it holds in
   * session storage beside the PKCE verifier and gives back with the user,
   * so it is never in a URL and the redirect URI stays the origin.
   */
  async signIn(): Promise<void> {
    if (!this.manager) return;
    this.error.set(null);
    await this.manager.signinRedirect(this.kept ? { state: this.kept } : undefined);
  }

  /** Forgets the tokens and sends the browser through the pool's logout endpoint. */
  async signOut(): Promise<void> {
    const config = this.config.value();
    if (!this.manager || !config) return;
    await this.manager.removeUser();
    this.navigate(logoutUrl(config, this.origin));
  }

  /** A full-page navigation; separate so that a test can observe it. */
  protected navigate(url: string): void {
    this.document.location.assign(url);
  }
}
