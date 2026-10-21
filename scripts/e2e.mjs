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
 *        E2E_PASSWORD=<password> node scripts/e2e.mjs --stack heat-dev --username <email>
 *        node scripts/e2e.mjs --stack heat-prod --anonymous
 *
 * With --anonymous the test stops after the checks that need no token: the
 * page, config.json, the managed login page, the hand-off to Google and the
 * authorizer's 401. That is prod's smoke test (Issue-41): prod has no
 * password-flow client and no test user, so nothing signs in and nothing is
 * written to its tables; the same commit ran the whole loop in dev, and the
 * authenticated check on prod is the owner's own Google sign-in.
 *
 * The site URL and the app client id are read from the stack's parameters,
 * /heat/heat-sb<issue>/ for a sandbox stack and /heat/<stack>/ for a
 * permanent environment (Issue-40's smoke test is this script against
 * heat-dev), and every call goes through the stack's hostname,
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
const stack = opt("stack") ?? (issue ? `heat-sb${issue}` : undefined);
const username = opt("username");
const password = process.env.E2E_PASSWORD;
const anonymousOnly = args.includes("--anonymous");
if (!stack || (!anonymousOnly && (!username || !password))) {
  console.error("usage: E2E_PASSWORD=<password> node scripts/e2e.mjs (--issue <n> | --stack <name>) (--username <email> | --anonymous)");
  process.exit(2);
}

const region = process.env.AWS_REGION ?? "us-east-1";
const prefix = `/heat/${stack}`;

function parameter(name) {
  return execFileSync("aws", ["ssm", "get-parameter", "--name", `${prefix}/${name}`, "--region", region, "--query", "Parameter.Value", "--output", "text"], {
    encoding: "utf8",
    env: { ...process.env, MSYS_NO_PATHCONV: "1" },
  }).trim();
}

const siteUrl = parameter("site_url");
// prod writes no app_client_id parameter, because it has no ci client.
const clientId = anonymousOnly ? undefined : parameter("app_client_id");
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

// The site before the API: the page, the client's configuration, and the
// authorizer refusing an anonymous call through the same hostname.
const page = await fetch(`${siteUrl}/`);
check(page.status === 200 && (await page.text()).includes("<heat-root>"), `GET ${siteUrl}/ serves the page`);
const configResponse = await fetch(`${siteUrl}/config.json`);
const config = configResponse.status === 200 ? await configResponse.json() : {};
check(config.graphqlPath === "/graphql", `GET ${siteUrl}/config.json names the API path`);
check(typeof config.clientId === "string" && config.clientId.length > 0 && /^https:\/\/auth\./.test(config.loginHost ?? ""), `config.json names the browser client and the login host ${config.loginHost}`);
// Email and password beside Google in a sandbox stack only (Issue-86): dev
// and prod are Google only.
const passwordExpected = stack.startsWith("heat-sb");
check(config.passwordSignIn === passwordExpected, `config.json says password sign-in is ${passwordExpected ? "offered" : "not offered"} (got ${config.passwordSignIn})`);

// Sign-in as the browser does it, up to Google's door: the managed login
// page renders for this stack's client and its callback, which proves the
// client, its branding style and the domain together; and the authorize
// endpoint with identity_provider=Google answers a redirect to Google, which
// proves the provider and the owner's Google client id are wired up. Nothing
// here signs in: that needs a Google account and a browser.
const loginPage = await fetch(`${config.loginHost}/login?client_id=${config.clientId}&response_type=code&redirect_uri=${encodeURIComponent(siteUrl)}`);
check(loginPage.status === 200, `the managed login page answers for the browser client at ${config.loginHost} (got ${loginPage.status})`);
const authorize = await fetch(`${config.loginHost}/oauth2/authorize?client_id=${config.clientId}&response_type=code&scope=openid+email+profile&identity_provider=Google&redirect_uri=${encodeURIComponent(siteUrl)}`, { redirect: "manual" });
const toGoogle = authorize.status === 302 && /^https:\/\/accounts\.google\.com\//.test(authorize.headers.get("location") ?? "");
check(toGoogle, `the authorize endpoint sends the browser to Google (got ${authorize.status} ${authorize.headers.get("location")?.split("?")[0] ?? ""})`);
const anonymous = await fetch(graphqlUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "{ __typename }" }) });
check(anonymous.status === 401, `POST ${graphqlUrl} without a token is refused with 401 (got ${anonymous.status})`);

if (anonymousOnly) {
  console.log("anonymous checks passed; nothing signed in and nothing written (--anonymous)");
  process.exit(0);
}

// The engine only from here on: the authenticated half compares the hub's
// rewards with it, so the anonymous run needs no engine build.
const { rewardsForSeed } = await import("@heat/engine");

const token = await signIn();
console.log(`signed in as ${username} through client ${clientId}`);

// First sign-in makes the profile, and a repeat changes nothing; the
// client calls joinGame after every sign-in in the same way.
const joined = await graphql(token, `mutation { joinGame { id name } }`);
check(!joined.errors && joined.data?.joinGame?.id, `joinGame answered the profile (${joined.ms} ms)`);

// The free villager (Issue-81). A sandbox stack's user meets a new camp
// and recruits; a test user that kept its villager from an earlier run
// (dev's, or a stack's after an earlier push) goes straight to the refusal.
const campQuery = `{ me { camps { location livingHeroes activeHeroes } heroes { id unitType status } } }`;
const camp = await graphql(token, campQuery);
const millbrook = camp.data?.me?.camps?.find((c) => c.location === "millbrook");
check(!camp.errors && millbrook, `me shows the starting camp: ${JSON.stringify(millbrook)} (${camp.ms} ms)`);
const recruitMutation = `mutation($id: String!) { recruitHero(unitType: "villager", requestId: $id) { id unitType spriteSet name status } }`;
if (millbrook.livingHeroes === 0) {
  const requestId = crypto.randomUUID();
  const recruited = await graphql(token, recruitMutation, { id: requestId });
  const hero = recruited.data?.recruitHero;
  check(!recruited.errors && hero?.id === requestId && hero.unitType === "villager", `recruitHero gave the free villager ${hero?.name} in ${hero?.spriteSet} (${recruited.ms} ms)`);
  const repeated = await graphql(token, recruitMutation, { id: requestId });
  check(repeated.data?.recruitHero?.id === requestId, `a repeat of the request answers the same hero (${repeated.ms} ms)`);
  const after = await graphql(token, campQuery);
  const counted = after.data?.me?.camps?.find((c) => c.location === "millbrook");
  check(counted?.livingHeroes === 1 && counted.activeHeroes === millbrook.activeHeroes + 1, `the camp counts one living hero (${after.ms} ms)`);
} else {
  console.log(`the test user already has ${millbrook.livingHeroes} living hero(es) at millbrook; checking the refusal only`);
}
const second = await graphql(token, recruitMutation, { id: crypto.randomUUID() });
check(second.errors?.[0]?.extensions?.code === "NOT_FREE", `a second free villager is refused while a hero lives (${second.ms} ms)`);

// Retirement (Issue-98), on a sandbox stack only: retire the living villager,
// which frees the next one, and recruit it. Dev's test user keeps its one
// villager, so its records do not gain a retired hero on every merge.
if (stack.startsWith("heat-sb")) {
  const living = await graphql(token, campQuery);
  const villager = living.data?.me?.heroes?.find((h) => h.status === "ALIVE");
  check(villager, `the camp has a living hero to retire (${living.ms} ms)`);
  const retireMutation = `mutation($id: String!) { retireHero(heroId: $id) { id status retiredAt } }`;
  const retired = await graphql(token, retireMutation, { id: villager.id });
  check(!retired.errors && retired.data?.retireHero?.status === "RETIRED", `retireHero retired ${villager.id} (${retired.ms} ms)`);
  const again = await graphql(token, retireMutation, { id: villager.id });
  check(again.data?.retireHero?.retiredAt === retired.data.retireHero.retiredAt, `a repeat of the retire answers the hero as it is (${again.ms} ms)`);
  const counts = (await graphql(token, campQuery)).data?.me?.camps?.find((c) => c.location === "millbrook");
  check(counts?.livingHeroes === 0, `the camp counts no living hero after the retire: ${JSON.stringify(counts)}`);
  const next = await graphql(token, recruitMutation, { id: crypto.randomUUID() });
  check(!next.errors && next.data?.recruitHero?.status === "ALIVE", `the free villager is offered again and recruited: ${next.data?.recruitHero?.name} (${next.ms} ms)`);
}

// A permanent environment's test user keeps its records between runs, so an
// adventure left open by a run that failed between its start and its settle
// would refuse every later start. Settle whatever is open first; a sandbox
// stack's user is new to each stack and has nothing open.
const settleMutation = `mutation($id: String!) { settleAdventure(adventureId: $id) { id camps { location holdings { material balance } } } }`;
const before = await graphql(token, `{ me { openAdventure { id } } }`);
const leftover = before.data?.me?.openAdventure?.id;
if (leftover) {
  const cleared = await graphql(token, settleMutation, { id: leftover });
  check(!cleared.errors, `settled the adventure ${leftover} that an earlier run left open (${cleared.ms} ms)`);
}

const start = await graphql(token, `mutation { startAdventure { id seed } }`);
check(!start.errors && start.data?.startAdventure?.id, `startAdventure opened an adventure (${start.ms} ms)`);
const { id, seed } = start.data.startAdventure;

const again = await graphql(token, `mutation { startAdventure { id } }`);
check(again.errors?.[0]?.message.includes("condition failed"), `a second start is refused while one is open (${again.ms} ms)`);

const settle = await graphql(token, settleMutation, { id });
check(!settle.errors && settle.data?.settleAdventure, `settleAdventure settled it (${settle.ms} ms)`);

const byMaterial = (a, b) => a.material.localeCompare(b.material);
const expected = rewardsForSeed(seed).map((r) => ({ material: r.material, balance: r.amount })).sort(byMaterial);
const got = [...(settle.data.settleAdventure.camps.find((c) => c.location === "millbrook")?.holdings ?? [])].sort(byMaterial);
const previous = JSON.stringify(got) === JSON.stringify(expected);
// A test user that has played before holds earlier rewards too: every
// expected material must have at least the expected balance.
const covered = expected.every((e) => got.some((g) => g.material === e.material && g.balance >= e.balance));
check(previous || covered, `the holdings carry the engine's rewards for seed ${seed}: ${JSON.stringify(got)}`);

const redelivered = await graphql(token, `mutation($id: String!) { settleAdventure(adventureId: $id) { id } }`, { id });
check(redelivered.errors?.[0]?.message.includes("condition failed"), `a second settle is refused, nothing paid twice (${redelivered.ms} ms)`);

console.log("stack test passed");
