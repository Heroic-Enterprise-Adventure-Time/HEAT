import { Service, signal } from '@angular/core';
import * as z from 'zod/mini';

/**
 * What the client knows about the stack it runs in, read from `/config.json`
 * before the application starts. The apply job writes the file beside the
 * build from the stack's Terraform outputs (`scripts/publish-client.sh`), so
 * one build serves any stack (decision 0018); on the dev server the proxy
 * fetches it from the branch's stack (`proxy.conf.mjs`). Nothing in it is
 * secret: the browser carries all of it.
 */
/** A field the client cannot run without: a string, and not empty. */
const present = z.string().check(z.minLength(1));

const StackConfigSchema = z.object({
  /** The API's path on this origin: `/graphql`. */
  graphqlPath: present,
  /** The user pool that issues the tokens, `us-east-1_...`; its region is the prefix. */
  userPoolId: present,
  /** The stack's browser app client in that pool. */
  clientId: present,
  /** The pool's managed login host, `https://auth.<zone>`, with no trailing slash. */
  loginHost: present,
  /**
   * Whether the login page offers email and password beside Google: true in
   * a sandbox stack, for the base's test users (Issue-86), false in dev and
   * prod. When false the client skips the login page and goes to Google.
   */
  passwordSignIn: z.boolean(),
  /**
   * The deploy's version, the commit the workflow deployed (decision 0030).
   * The client sends it on every request, and the hub says when it differs
   * from its own.
   */
  version: present,
});

export type StackConfig = Readonly<z.output<typeof StackConfigSchema>>;

/** Reads the fields out of the parsed file, or says which is missing. */
export function parseStackConfig(value: unknown): StackConfig {
  const parsed = StackConfigSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const field = parsed.error.issues[0]?.path.join('.');
  throw new Error(field ? `config.json lacks ${field}` : 'config.json is not an object');
}

/** The loaded configuration, or the reason it could not be loaded. */
@Service()
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
