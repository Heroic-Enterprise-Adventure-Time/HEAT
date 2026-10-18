import { execFileSync } from "node:child_process";

/**
 * The stack test: signs in to the base pool as a test user through the ci
 * client, then drives the adventure loop through the stack's HTTP API,
 * exactly as a client would, and checks what the hub answers against the
 * engine, the same check the hub's own test makes against DynamoDB Local.
 * The run summary of every push shows it passing against the real gateway,
 * authorizer, IAM path and tables (decision 0018).
 *
 * Usage: E2E_PASSWORD=<password> node scripts/e2e.mjs --issue <n> --username <email>
 *
 * The site URL and the app client id are read from the stack's parameters,
 * /heat/heat-sb<issue>/, and every call goes through the stack's hostname,
 * as the browser's will: the page at /, config.json, and /graphql behind
 * CloudFront, which proves that the Authorization header crosses it. The
 * parameters are read with whatever AWS credentials are in the
 * environment: the apply role in the workflow, the plan role on a laptop.
 * The password comes from the environment, never from an argument, so it
 * is in no process list and no log. In the workflow the user is minted for
 * the stack by scripts/e2e-user.sh; on a laptop it is player1 and the
 * owner's password. Sign-in is Cognito's unauthenticated InitiateAuth
 * call, made directly, so the password never reaches a shell.
 */

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const issue = opt("issue");
const username = opt("username");
const password = process.env.E2E_PASSWORD;
if (!issue || !username || !password) {
  console.error("usage: E2E_PASSWORD=<password> node scripts/e2e.mjs --issue <n> --username <email>");
  process.exit(2);
}

const region = process.env.AWS_REGION ?? "us-east-1";
const prefix = `/heat/heat-sb${issue}`;

function parameter(name) {
  return execFileSync("aws", ["ssm", "get-parameter", "--name", `${prefix}/${name}`, "--region", region, "--query", "Parameter.Value", "--output", "text"], {
    encoding: "utf8",
    env: { ...process.env, MSYS_NO_PATHCONV: "1" },
  }).trim();
}

const siteUrl = parameter("site_url");
const clientId = parameter("app_client_id");
const graphqlUrl = `${siteUrl}/graphql`;

async function signIn() {
  const response = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: "POST",
    headers: { "content-type": "application/x-amz-json-1.1", "x-amz-target": "AWSCognitoIdentityProviderService.InitiateAuth" },
    body: JSON.stringify({ AuthFlow: "USER_PASSWORD_AUTH", ClientId: clientId, AuthParameters: { USERNAME: username, PASSWORD: password } }),
  });
  const body = await response.json();
  if (!response.ok || !body.AuthenticationResult?.AccessToken) {
    throw new Error(`sign-in failed: ${body.__type ?? response.status} ${body.message ?? ""}`.trim());
  }
  return body.AuthenticationResult.AccessToken;
}

async function graphql(token, query, variables = {}) {
  const started = performance.now();
  const response = await fetch(graphqlUrl, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const ms = Math.round(performance.now() - started);
  if (response.status !== 200) throw new Error(`HTTP ${response.status} from ${graphqlUrl}: ${await response.text()}`);
  return { ...(await response.json()), ms };
}

const check = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`ok: ${message}`);
};

const { rewardsForSeed } = await import("@heat/engine");

// The site before the API: the page, the client's configuration, and the
// authorizer refusing an anonymous call through the same hostname.
const page = await fetch(`${siteUrl}/`);
check(page.status === 200 && (await page.text()).includes("<heat-root>"), `GET ${siteUrl}/ serves the page`);
const config = await fetch(`${siteUrl}/config.json`);
check(config.status === 200 && (await config.json()).graphqlPath === "/graphql", `GET ${siteUrl}/config.json names the API path`);
const anonymous = await fetch(graphqlUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "{ __typename }" }) });
check(anonymous.status === 401, `POST ${graphqlUrl} without a token is refused with 401 (got ${anonymous.status})`);

const token = await signIn();
console.log(`signed in as ${username} through client ${clientId}`);

const start = await graphql(token, `mutation { startAdventure { id seed } }`);
check(!start.errors && start.data?.startAdventure?.id, `startAdventure opened an adventure (${start.ms} ms)`);
const { id, seed } = start.data.startAdventure;

const again = await graphql(token, `mutation { startAdventure { id } }`);
check(again.errors?.[0]?.message.includes("condition failed"), `a second start is refused while one is open (${again.ms} ms)`);

const settle = await graphql(token, `mutation($id: String!) { settleAdventure(adventureId: $id) { id holdings { material balance } } }`, { id });
check(!settle.errors && settle.data?.settleAdventure, `settleAdventure settled it (${settle.ms} ms)`);

const byMaterial = (a, b) => a.material.localeCompare(b.material);
const expected = rewardsForSeed(seed).map((r) => ({ material: r.material, balance: r.amount })).sort(byMaterial);
const got = [...settle.data.settleAdventure.holdings].sort(byMaterial);
const previous = JSON.stringify(got) === JSON.stringify(expected);
// A test user that has played before holds earlier rewards too: every
// expected material must have at least the expected balance.
const covered = expected.every((e) => got.some((g) => g.material === e.material && g.balance >= e.balance));
check(previous || covered, `the holdings carry the engine's rewards for seed ${seed}: ${JSON.stringify(got)}`);

const redelivered = await graphql(token, `mutation($id: String!) { settleAdventure(adventureId: $id) { id } }`, { id });
check(redelivered.errors?.[0]?.message.includes("condition failed"), `a second settle is refused, nothing paid twice (${redelivered.ms} ms)`);

console.log("stack test passed");
