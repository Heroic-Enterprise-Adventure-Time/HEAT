import { expect, type Page, test } from '@playwright/test';

import { password, seedSession, siteUrl, stack, stackConfig, username } from './stack';

/**
 * The page on a running stack, as a player meets it (decision 0045;
 * `docs/standards/angular.md`, rule 18). What the page does with each answer
 * is the unit tests', and what the hub answers is `scripts/e2e.mjs`'s: this
 * asks whether a real browser gets from the hostname to a drawn camp and back.
 */

const signInButton = (page: Page) => page.getByRole('banner').getByRole('button', { name: /^Sign in/ });
const signOutButton = (page: Page) => page.getByRole('banner').getByRole('button', { name: 'Sign out' });
const living = (page: Page) => page.getByRole('list', { name: 'Living' }).getByRole('link');

/** What goes wrong in the page from here on, so call it before the first navigation. */
function watchForProblems(page: Page): string[] {
  const art = `${siteUrl}/art/`;
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('response', (response) => {
    if (response.url().startsWith(art) && !response.ok()) problems.push(`${response.status()} from ${response.url()}`);
  });
  page.on('requestfailed', (request) => {
    // Leaving the page aborts what it was still fetching, which is no fault of the art's.
    const reason = request.failure()?.errorText ?? 'failed';
    if (request.url().startsWith(art) && reason !== 'net::ERR_ABORTED') problems.push(`${reason} for ${request.url()}`);
  });
  return problems;
}

/** Waits for the hall with the camp's data in it; the list of heroes can be read after this. */
async function hallIsShown(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Heroes hall' })).toBeVisible();
  await expect(page.getByText(/^Level \d+: \d+ of \d+ heroes\.$/)).toBeVisible();
}

/** Signs in through the managed login's form, which a sandbox stack offers (Issue-86). */
async function signInWithTheForm(page: Page): Promise<void> {
  await page.goto(siteUrl);
  await signInButton(page).click();
  await page.getByLabel('Email address').fill(username);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(`${siteUrl}/**`);
}

/** Retires every living hero through its card, which offers the free villager again. */
async function retireEveryone(page: Page): Promise<void> {
  await hallIsShown(page);
  while ((await living(page).count()) > 0) {
    const name = await living(page).first().innerText();
    await living(page).first().click();
    await page.getByRole('button', { name: 'Retire', exact: true }).click();
    await page.getByRole('button', { name: `Retire ${name}` }).click();
    await expect(page.getByText(/^retired/)).toBeVisible();
    await page.getByRole('link', { name: '← Heroes hall' }).click();
    await hallIsShown(page);
  }
}

/** From the signed-in page: the drawn camp, a villager, a hero's card, and out. */
async function playAndLeave(page: Page, problems: readonly string[]): Promise<void> {
  await expect(signOutButton(page)).toBeVisible();
  await expect(page.getByRole('banner')).toContainText(username);
  await expect(page.getByRole('img', { name: 'The camp' })).toBeVisible();
  await hallIsShown(page);

  // A test user's records are throwaway on a sandbox stack, and the stack test
  // leaves a villager, so the recruit would never run without this. dev's test
  // user keeps its villager, as in scripts/e2e.mjs.
  if (stack.startsWith('heat-sb')) await retireEveryone(page);
  if ((await living(page).count()) === 0) {
    await page.getByRole('button', { name: 'Recruit a villager' }).click();
    await expect(living(page)).toHaveCount(1);
  }

  const name = await living(page).first().innerText();
  await living(page).first().click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByText('alive', { exact: true })).toBeVisible();

  // The exact address: the page's own routes also match the site's origin, so
  // only this one shows that the browser went through the logout and came back.
  await signOutButton(page).click();
  await page.waitForURL(`${siteUrl}/`);
  await expect(signInButton(page)).toBeVisible();
  expect(problems).toEqual([]);
}

// As dev's and prod's page: told that Google is the only way in, on every stack,
// so a change that breaks this shows on the branch and not first on dev. The
// authorize request is answered here and its redirect is only read: a route
// does not see the request a redirect makes, so letting it through would load
// Google's own page (decision 0045, "Facts checked").
test('a signed-out visitor is handed off to Google', async ({ page }) => {
  const problems = watchForProblems(page);
  const { loginHost } = await stackConfig();
  await page.route(`${siteUrl}/config.json`, async (route) => {
    const response = await route.fetch();
    const config = (await response.json()) as object;
    await route.fulfill({ response, json: { ...config, passwordSignIn: false } });
  });
  const handedTo = new Promise<string>((resolve) => {
    void page.route(`${loginHost}/oauth2/authorize**`, async (route) => {
      const response = await route.fetch({ maxRedirects: 0 });
      resolve(response.headers()['location'] ?? `no redirect, ${response.status()}`);
      await route.fulfill({ status: 200, body: '' });
    });
  });

  await page.goto(siteUrl);
  await expect(page.getByRole('heading', { name: 'HEAT', level: 1 })).toBeVisible();
  await signInButton(page).click();
  expect(await handedTo).toMatch(/^https:\/\/forced-failure\.invalid\//);
  expect(problems).toEqual([]);
});

test('a player signs in through the form, finds the camp and signs out', async ({ page }) => {
  const { passwordSignIn } = await stackConfig();
  test.skip(!passwordSignIn, 'this stack offers Google only');
  const problems = watchForProblems(page);
  await signInWithTheForm(page);
  await playAndLeave(page, problems);
});

// How dev's signed-in half gets a session. It runs on a sandbox stack too, so
// a change that breaks it shows on the branch and not first on dev.
test('a player with a session finds the camp and signs out', async ({ page }) => {
  const problems = watchForProblems(page);
  await seedSession(page);
  await page.goto(siteUrl);
  await playAndLeave(page, problems);
});
