import { defineConfig, devices } from '@playwright/test';

/**
 * The browser smoke test of the page on a running stack (decision 0045). One
 * engine, Chromium, because the test asks whether the page works at all and
 * not how browsers differ. A trace holds the password and the tokens, so it is
 * kept on failure only, and the workflow encrypts it before it leaves the
 * runner: the repository is public and so are its artifacts.
 */
export default defineConfig({
  testDir: 'e2e',
  forbidOnly: true,
  workers: 1,
  timeout: 120_000,
  // A runner draws in software, so a canvas can take longer than the default
  // five seconds. No retries: one would hide a page that only sometimes works.
  expect: { timeout: 15_000 },
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], trace: 'retain-on-failure' },
});
