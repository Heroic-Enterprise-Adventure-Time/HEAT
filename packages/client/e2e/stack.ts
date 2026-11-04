import { execFileSync } from 'node:child_process';

import type { Page } from '@playwright/test';
import * as z from 'zod/mini';

/**
 * The stack under test and its test user. The stack's facts come from its
 * parameters and its `config.json`, as `scripts/e2e.mjs` reads them, read with
 * whatever AWS credentials are in the environment: the apply role in the
 * workflow, the plan role on a laptop. The password comes from the
 * environment, so it is in no process list and no log.
 */
const present = z.string().check(z.minLength(1));
const env = z.parse(
  z.object({ E2E_STACK: present, E2E_USERNAME: present, E2E_PASSWORD: present, AWS_REGION: z.optional(present) }),
  process.env,
);
const region = env.AWS_REGION ?? 'us-east-1';

export const stack = env.E2E_STACK;
export const username = env.E2E_USERNAME;
export const password = env.E2E_PASSWORD;

function parameter(name: string): string {
  return execFileSync('aws', ['ssm', 'get-parameter', '--name', `/heat/${stack}/${name}`, '--region', region, '--query', 'Parameter.Value', '--output', 'text'], {
    encoding: 'utf8',
    env: { ...process.env, MSYS_NO_PATHCONV: '1' },
  }).trim();
}

export const siteUrl = parameter('site_url');

const ConfigSchema = z.object({ userPoolId: present, clientId: present, loginHost: present, passwordSignIn: z.boolean() });

export async function stackConfig(): Promise<z.output<typeof ConfigSchema>> {
  const response = await fetch(`${siteUrl}/config.json`);
  return z.parse(ConfigSchema, await response.json());
}

const TokensSchema = z.object({ AuthenticationResult: z.object({ AccessToken: present, ExpiresIn: z.number() }) });

/**
 * A session without the managed login page, for a stack whose page sends a
 * player to Google (decision 0045): the `ci` client's token, which the stack's
 * authorizer accepts, written where the page's session library looks for its
 * user. Playwright's own recipe for session storage, which it does not carry
 * in a storage state. Written once, so that signing out stays signed out; no
 * refresh token, so that nothing renews a session this short.
 */
export async function seedSession(page: Page): Promise<void> {
  const config = await stackConfig();
  const response = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': 'AWSCognitoIdentityProviderService.InitiateAuth' },
    body: JSON.stringify({ AuthFlow: 'USER_PASSWORD_AUTH', ClientId: parameter('app_client_id'), AuthParameters: { USERNAME: username, PASSWORD: password } }),
  });
  const tokens = z.parse(TokensSchema, await response.json()).AuthenticationResult;
  const authority = `https://cognito-idp.${region}.amazonaws.com/${config.userPoolId}`;
  await page.addInitScript(
    (seed) => {
      if (location.origin !== seed.origin || sessionStorage.getItem('e2e.seeded')) return;
      sessionStorage.setItem('e2e.seeded', 'true');
      sessionStorage.setItem(seed.key, seed.user);
    },
    {
      origin: siteUrl,
      key: `oidc.user:${authority}:${config.clientId}`,
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
