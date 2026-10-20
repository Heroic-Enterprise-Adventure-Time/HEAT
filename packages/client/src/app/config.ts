import { Injectable, signal } from '@angular/core';

/**
 * What the client knows about the stack it runs in, read from `/config.json`
 * before the application starts. The apply job writes the file beside the
 * build from the stack's Terraform outputs (`scripts/publish-client.sh`), so
 * one build serves any stack (decision 0018); on the dev server the proxy
 * fetches it from the branch's stack (`proxy.conf.mjs`). Nothing in it is
 * secret: the browser carries all of it.
 */
export interface StackConfig {
  /** The API's path on this origin: `/graphql`. */
  readonly graphqlPath: string;
  /** The user pool that issues the tokens, `us-east-1_...`; its region is the prefix. */
  readonly userPoolId: string;
  /** The stack's browser app client in that pool. */
  readonly clientId: string;
  /** The pool's managed login host, `https://auth.<zone>`, with no trailing slash. */
  readonly loginHost: string;
  /**
   * Whether the login page offers email and password beside Google: true in
   * a sandbox stack, for the base's test users (Issue-86), false in dev and
   * prod. When false the client skips the login page and goes to Google.
   */
  readonly passwordSignIn: boolean;
}

const FIELDS = ['graphqlPath', 'userPoolId', 'clientId', 'loginHost'] as const;

/** Reads the fields out of the parsed file, or says which one is missing. */
export function parseStackConfig(value: unknown): StackConfig {
  if (typeof value !== 'object' || value === null) throw new Error('config.json is not an object');
  const record = value as Record<string, unknown>;
  for (const field of FIELDS) {
    const v = record[field];
    if (typeof v !== 'string' || v.length === 0) throw new Error(`config.json lacks ${field}`);
  }
  if (typeof record['passwordSignIn'] !== 'boolean') throw new Error('config.json lacks passwordSignIn');
  return {
    graphqlPath: record['graphqlPath'] as string,
    userPoolId: record['userPoolId'] as string,
    clientId: record['clientId'] as string,
    loginHost: record['loginHost'] as string,
    passwordSignIn: record['passwordSignIn'],
  };
}

/** The loaded configuration, or the reason it could not be loaded. */
@Injectable({ providedIn: 'root' })
export class Config {
  readonly value = signal<StackConfig | null>(null);
  readonly error = signal<string | null>(null);

  /**
   * Fetches and parses `/config.json`. A failure is recorded, not thrown, so
   * that the page still renders and can say what is wrong: a dev server
   * without its proxy, or a bucket published without the file.
   */
  async load(fetchFn: typeof fetch = fetch): Promise<void> {
    try {
      const response = await fetchFn('/config.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`GET /config.json answered ${response.status}`);
      this.value.set(parseStackConfig(await response.json()));
      this.error.set(null);
    } catch (e) {
      this.value.set(null);
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }
}
