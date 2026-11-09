import { signal } from '@angular/core';

import type { SessionUser } from '../session';

/** The signed-in player of a test that does not care who it is. */
export const PLAYER: SessionUser = { email: 'player@example.com', name: null, accessToken: 't' };

/** A session with a settable user and recorded actions, in place of the real one. */
export function fakeSession(user: SessionUser | null) {
  const fake = {
    user: signal(user),
    signInLabel: 'Sign in with Google',
    error: signal<string | null>(null),
    signedIn: 0,
    signedOut: 0,
    signIn: () => {
      fake.signedIn++;
      return Promise.resolve();
    },
    signOut: () => {
      fake.signedOut++;
      return Promise.resolve();
    },
  };
  return fake;
}
