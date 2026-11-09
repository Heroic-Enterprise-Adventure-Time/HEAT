import type { Page } from '@playwright/test';
import * as z from 'zod/mini';

/**
 * The stack under test and its test user, from the environment that
 * `scripts/browser-test.mjs` gives the test: it reads the stack's parameters
 * and starts Playwright without any AWS credentials. The stack's other facts
 * are its `config.json`, as the page reads them.
 */
const present = z.string().check(z.minLength(1));
const env = z.parse(
  z.object({ E2E_STACK: present, E2E_SITE_URL: present, E2E_CI_CLIENT_ID: present, E2E_USERNAME: present, E2E_PASSWORD: present }),
  process.env,
);

export const stack = env.E2E_STACK;
export const siteUrl = env.E2E_SITE_URL;
export const username = env.E2E_USERNAME;
export const password = env.E2E_PASSWORD;

const ConfigSchema = z.object({ userPoolId: present, clientId: present, loginHost: present, passwordSignIn: z.boolean() });
type StackConfig = z.output<typeof ConfigSchema>;

async function readConfig(): Promise<StackConfig> {
  const response = await fetch(`${siteUrl}/config.json`);
  if (!response.ok) throw new Error(`GET ${siteUrl}/config.json answered ${response.status}`);
  return z.parse(ConfigSchema, await response.json());
}

let config: Promise<StackConfig> | undefined;

/** The stack's `config.json`, read once per worker. */
export function stackConfig(): Promise<StackConfig> {
  config ??= readConfig();
  return config;
}

const TokensSchema = z.object({ AuthenticationResult: z.object({ AccessToken: present, ExpiresIn: z.number() }) });
const RefusalSchema = z.object({ __type: z.optional(z.string()), message: z.optional(z.string()) });

/**
 * A session without the managed login page, for a stack whose page sends a
 * player to Google (decision 0045): the `ci` client's token, which the stack's
 * authorizer accepts, written where the page's session library looks for its
 * user. Playwright's own recipe for session storage, which it does not carry
 * in a storage state. Written once, so that signing out stays signed out; no
 * refresh token, so that nothing renews a session this short.
 *
 * The sign-in is a plain request rather than the Cognito SDK's client: one
 * unauthenticated call, the same as `scripts/e2e.mjs` makes, is smaller than
 * what the SDK would add to the client's dependencies
 * (`docs/standards/typescript.md`, rule 17).
 */
export async function seedSession(page: Page): Promise<void> {
  const { userPoolId, clientId } = await stackConfig();
  const region = userPoolId.split('_')[0] ?? '';
  const response = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': 'AWSCognitoIdentityProviderService.InitiateAuth' },
    body: JSON.stringify({ AuthFlow: 'USER_PASSWORD_AUTH', ClientId: env.E2E_CI_CLIENT_ID, AuthParameters: { USERNAME: username, PASSWORD: password } }),
  });
  const answer: unknown = await response.json();
  if (!response.ok) {
    const refusal = z.parse(RefusalSchema, answer);
    throw new Error(`sign-in failed: ${refusal.__type ?? String(response.status)} ${refusal.message ?? ''}`.trim());
  }
  const tokens = z.parse(TokensSchema, answer).AuthenticationResult;
  await page.addInitScript(
    (seed) => {
      if (location.origin !== seed.origin || sessionStorage.getItem('e2e.seeded')) return;
      sessionStorage.setItem('e2e.seeded', 'true');
      sessionStorage.setItem(seed.key, seed.user);
    },
    {
      origin: siteUrl,
      key: `oidc.user:https://cognito-idp.${region}.amazonaws.com/${userPoolId}:${clientId}`,
      user: JSON.stringify({
        access_token: tokens.AccessToken,
        token_type: 'Bearer',
        scope: 'openid email profile',
        profile: { sub: username, email: username },
        expires_at: Math.floor(Date.now() / 1000) + tokens.ExpiresIn,
      }),
    },
  );
}
