// The headless shell that .github/actions/browser-test pins is the one the
// locked Playwright launches. A Playwright update reaches a pull request
// that has no stack when Dependabot opens it, so the action's own refusal
// would first run on main; this runs in "Build and test" instead
// (docs/process/best-practices.md, rule 14). Here and not under the root's
// scripts/, whose tests need nothing installed (docs/standards/typescript.md,
// rule 8); Playwright is this package's. Paths are from the repository root,
// where npm installs the workspaces' packages and the action reads them.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

test("the pinned headless shell is the locked Playwright's", () => {
  const action = read(".github/actions/browser-test/action.yml");
  const pinned = (name) => new RegExp(`^\\s+${name}: "?([^"\\s]+)"?$`, "m").exec(action)?.[1];
  const shell = JSON.parse(read("node_modules/playwright-core/browsers.json")).browsers.find(
    (browser) => browser.name === "chromium-headless-shell",
  );
  assert.deepEqual(
    { revision: pinned("CHROMIUM_REVISION"), version: pinned("CHROMIUM_VERSION") },
    { revision: shell.revision, version: shell.browserVersion },
    "Move CHROMIUM_REVISION, CHROMIUM_VERSION and CHROMIUM_SHA256 with Playwright",
  );
  assert.match(pinned("CHROMIUM_SHA256") ?? "", /^[0-9a-f]{64}$/);
});
