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
  while ((await living(page).count()) > 0) {
    const name = await living(page).first().innerText();
    await living(page).first().click();
    await page.getByRole('button', { name: 'Retire', exact: true }).click();
    await page.getByRole('button', { name: `Retire ${name}` }).click();
    await expect(page.getByText(/^retired/)).toBeVisible();
    await page.getByRole('link', { name: '← Heroes hall' }).click();
  }
}

/** From the signed-in page: the drawn camp, a villager, a hero's card, and out. */
async function playAndLeave(page: Page): Promise<void> {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('response', (response) => {
    if (response.url().startsWith(`${siteUrl}/art/`) && !response.ok()) problems.push(`${response.status()} from ${response.url()}`);
  });

  await expect(signOutButton(page)).toBeVisible();
  await expect(page.getByRole('banner')).toContainText(username);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Heroes hall' })).toBeVisible();
  await expect(page.getByText(/^Level \d+: \d+ of \d+ heroes\.$/)).toBeVisible();

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

  await signOutButton(page).click();
  await page.waitForURL(`${siteUrl}/**`);
  await expect(signInButton(page)).toBeVisible();
  expect(problems).toEqual([]);
}

test('a signed-out visitor sees the page and is sent to sign in', async ({ page }) => {
  const config = await stackConfig();
  // Only that the page hands off to Google: the test never loads Google's page.
  await page.route('https://accounts.google.com/**', (route) => route.fulfill({ status: 200, body: '' }));
  await page.goto(siteUrl);
  await expect(page.getByRole('heading', { name: 'HEAT', level: 1 })).toBeVisible();
  await signInButton(page).click();
  if (config.passwordSignIn) {
    await page.waitForURL(`${config.loginHost}/login**`);
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  } else {
    await page.waitForURL('https://accounts.google.com/**');
  }
});

test('a player signs in through the form, finds the camp and signs out', async ({ page }) => {
  const config = await stackConfig();
  test.skip(!config.passwordSignIn, 'this stack offers Google only');
  await signInWithTheForm(page);
  await playAndLeave(page);
});

// How dev's signed-in half gets a session. It runs on a sandbox stack too, so
// a change that breaks it shows on the branch and not first on dev.
test('a player with a session finds the camp and signs out', async ({ page }) => {
  await seedSession(page);
  await page.goto(siteUrl);
  await playAndLeave(page);
});
