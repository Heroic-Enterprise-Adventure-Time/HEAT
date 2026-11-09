import { execFileSync, spawnSync } from "node:child_process";

/**
 * Runs the browser test (decision 0045) against a stack. The workflow hands it
 * the site URL and the ci client's id by environment, in a job that holds no
 * role (docs/process/best-practices.md, rule 13; decision 0046). On a laptop
 * it reads them from the stack's parameters under the plan role, then starts
 * Playwright with every AWS_ variable removed: a browser and a downloaded test
 * runner hold no role's credentials. The password comes from the environment,
 * never from an argument.
 *
 * Usage: E2E_PASSWORD=<password> node scripts/browser-test.mjs --stack <name> --username <email>
 */

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const stack = opt("stack");
const username = opt("username");
if (!stack || !username || !process.env.E2E_PASSWORD) {
  console.error("usage: E2E_PASSWORD=<password> node scripts/browser-test.mjs --stack <name> --username <email>");
  process.exit(2);
}

const region = process.env.AWS_REGION ?? "us-east-1";

function parameter(name) {
  return execFileSync("aws", ["ssm", "get-parameter", "--name", `/heat/${stack}/${name}`, "--region", region, "--query", "Parameter.Value", "--output", "text"], {
    encoding: "utf8",
    env: { ...process.env, MSYS_NO_PATHCONV: "1" },
  }).trim();
}

const facts = {
  E2E_STACK: stack,
  E2E_USERNAME: username,
  E2E_SITE_URL: process.env.E2E_SITE_URL ?? parameter("site_url"),
  E2E_CI_CLIENT_ID: process.env.E2E_CI_CLIENT_ID ?? parameter("app_client_id"),
};
const withoutAws = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("AWS_")));

const run = spawnSync("npm", ["run", "e2e", "--workspace", "@heat/client"], { stdio: "inherit", shell: process.platform === "win32", env: { ...withoutAws, ...facts } });
process.exit(run.status ?? 1);
