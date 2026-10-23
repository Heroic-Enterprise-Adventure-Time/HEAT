import { execFileSync } from "node:child_process";

/**
 * The stack test: signs in to the base pool as a test user through the ci
 * client, then drives the adventure loop through the stack's HTTP API,
 * exactly as a client would, and checks what the hub answers against the
 * engine, the same check the hub's own test makes against DynamoDB Local:
 * start, submit with the hub's replay, settlement against the real tables
 * and the real replay bucket, the timeline read back, and the version of
 * both routes, /graphql and /previous/graphql (Issue-114).
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
// The deploy before the current one, at its own route (decision 0030).
const previousUrl = `${siteUrl}/previous/graphql`;

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

async function graphql(token, query, variables = {}, headers = {}, url = graphqlUrl) {
  const started = performance.now();
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...headers },
    body: JSON.stringify({ query, variables }),
  });
  const ms = Math.round(performance.now() - started);
  // 400 is GraphQL's own refusal of a document, a field the deploy does not
  // have among them, and carries its errors like any answer.
  if (response.status !== 200 && response.status !== 400) throw new Error(`HTTP ${response.status} from ${url}: ${await response.text()}`);
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
// The deploy's version, the commit the workflow deployed (decision 0030);
// the authenticated half checks that the hub carries the same one.
check(/^[0-9a-f]{40}$/.test(config.version ?? ""), `config.json names the deploy's version ${config.version}`);

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
// result with its own replay, so the anonymous run needs no engine build.
const { replay, levelForXp } = await import("@heat/engine");

const token = await signIn();
console.log(`signed in as ${username} through client ${clientId}`);

// First sign-in makes the profile, and a repeat changes nothing; the
// client calls joinGame after every sign-in in the same way.
const joined = await graphql(token, `mutation { joinGame { id name } }`);
check(!joined.errors && joined.data?.joinGame?.id, `joinGame answered the profile (${joined.ms} ms)`);

// A permanent environment's test user keeps its records between runs, and a
// stack's keeps them between pushes, so an adventure left open by a run that
// failed between its start and its submit would refuse every later start and
// keep its villager from retiring. Close whatever is open first, the way the
// client does (decision 0030): submit to the current route, then to the
// previous one, and discard when both say ENGINE_UPDATED.
const submitMutation = `mutation($id: String!, $log: [OverrideInput!]!) { submitAdventure(adventureId: $id, overrides: $log) { id status result { outcome rewards { material amount } credited { material amount } lost { material amount } heroes { heroId xpGained xp level dead } } } }`;
const before = await graphql(token, `{ me { openAdventure { id } } }`);
const leftover = before.data?.me?.openAdventure?.id;
if (leftover) {
  let closed = await graphql(token, submitMutation, { id: leftover, log: [] });
  if (closed.errors?.[0]?.extensions?.code === "ENGINE_UPDATED") {
    closed = await graphql(token, submitMutation, { id: leftover, log: [] }, {}, previousUrl);
  }
  if (closed.errors) {
    closed = await graphql(token, `mutation($id: String!) { discardAdventure(adventureId: $id) { id status } }`, { id: leftover });
  }
  check(!closed.errors, `closed the adventure ${leftover} that an earlier run left open (${closed.ms} ms)`);
}

// The free villager (Issue-81). A sandbox stack's user meets a new camp
// and recruits; a test user that kept its villager from an earlier run
// (dev's, or a stack's after an earlier push) goes straight to the fighter.
const campQuery = `{ me { camps { location livingHeroes activeHeroes } heroes { id unitType status location } } }`;
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
// A fighter costs 40 ore, and no job yields ore until the mine's (Issue-133),
// so on every stack it is refused with what is short (Issue-82).
const fighter = await graphql(token, `mutation($id: String!) { recruitHero(unitType: "fighter", requestId: $id) { id } }`, { id: crypto.randomUUID() });
const short = fighter.errors?.[0]?.extensions;
check(short?.code === "INSUFFICIENT_RESOURCES" && short.short?.[0]?.material === "ore" && short.short[0].amount === 40, `a fighter is refused for want of ore: ${JSON.stringify(short?.short)} (${fighter.ms} ms)`);

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

// A job (Issue-113, Issue-114): "Timber from the near woods" with the living
// villager, the snapshot stamped with the deploy's version. Timber rather
// than "Pick up sticks", the first job, because a lone villager clears it on
// every seed too, and it also runs a fight and credits two materials on the
// server; the wolves kill a lone villager on every seed (decision 0031).
const job = "timber-from-the-near-woods";
const heroQuery = `{ me { camps { location holdings { material balance } } heroes { id unitType status location xp level } } }`;
const home = (await graphql(token, heroQuery)).data?.me;
const party = home?.heroes?.find((h) => h.status === "ALIVE" && h.location === "millbrook");
check(party?.unitType === "villager", `the camp has a living villager to send: ${party?.id}`);
const startMutation = `mutation($heroIds: [String!]!) { startAdventure(location: "millbrook", jobId: "${job}", heroIds: $heroIds) { id seed } }`;
const start = await graphql(token, startMutation, { heroIds: [party.id] });
check(!start.errors && start.data?.startAdventure?.id, `startAdventure set out on the timber job (${start.ms} ms)`);
const { id, seed } = start.data.startAdventure;

const open = await graphql(token, `{ me { openAdventure { id seed location version job { id name } snapshot { version jobId heroes { heroId unitType name spriteSet level stats { maxHealth speed damage gathering } } } } } }`);
const adventure = open.data?.me?.openAdventure;
check(!open.errors && adventure?.id === id && adventure.seed === seed && adventure.job?.id === job, `me shows the open adventure: ${adventure?.job?.name} at ${adventure?.location} (${open.ms} ms)`);
check(adventure.snapshot?.jobId === adventure.job.id && adventure.snapshot.heroes.length === 1 && adventure.snapshot.heroes[0].heroId === party.id && adventure.snapshot.heroes[0].unitType === "villager", `the snapshot holds the villager and the job: ${JSON.stringify(adventure.snapshot?.heroes)}`);
check(adventure.version === config.version && adventure.snapshot.version === config.version, `the adventure is stamped with config.json's version, so the hub and the client carry one (${adventure.version})`);

const again = await graphql(token, startMutation, { heroIds: [party.id] });
check(again.errors?.[0]?.extensions?.code === "ADVENTURE_OPEN" && again.errors[0].extensions.adventureId === id, `a second start is refused with ADVENTURE_OPEN, naming the open one (${again.ms} ms)`);
const busy = await graphql(token, `mutation($id: String!) { retireHero(heroId: $id) { id } }`, { id: party.id });
check(busy.errors?.[0]?.extensions?.code === "HERO_ADVENTURING", `the villager cannot retire while it is adventuring (${busy.ms} ms)`);

// The version header (decision 0030): the deploy's own gets no flag, any
// other gets outdated: true, through CloudFront and the gateway.
const current = await graphql(token, `{ me { id } }`, {}, { "heat-version": config.version });
check(current.extensions?.outdated === undefined, `a request carrying the deploy's version is not flagged (${current.ms} ms)`);
const stale = await graphql(token, `{ me { id } }`, {}, { "heat-version": "0".repeat(40) });
check(stale.extensions?.outdated === true, `a request carrying another version is flagged outdated (${stale.ms} ms)`);

// Submit with no overrides (Issue-114): the hub replays the run, stores the
// timeline and settles. Its result must be the engine's own replay of the
// snapshot and seed it issued, and the camp must hold what it credited.
const expected = replay(adventure.snapshot, seed, []).result;
const submitted = await graphql(token, submitMutation, { id, log: [] });
const result = submitted.data?.submitAdventure?.result;
check(!submitted.errors && submitted.data.submitAdventure.status === "SETTLED", `submitAdventure settled it (${submitted.ms} ms)`);
check(result.outcome === expected.outcome && expected.outcome === "complete", `the hub's verdict is the engine's: ${result.outcome}`);

const byMaterial = (a, b) => a.material.localeCompare(b.material);
const sorted = (rewards) => JSON.stringify([...rewards].sort(byMaterial));
check(sorted(result.rewards) === sorted(expected.rewards), `the rewards are the job's pay and the cargo: ${sorted(result.rewards)}`);
// The test user of dev keeps its warehouse between merges, so what the cap
// turns away is part of the check rather than a failure.
const added = (material) => [...result.credited, ...result.lost].filter((r) => r.material === material).reduce((n, r) => n + r.amount, 0);
check(result.rewards.every((r) => added(r.material) === r.amount), `every reward was credited or lost at the cap: credited ${sorted(result.credited)}, lost ${sorted(result.lost)}`);
const balance = (me, material) => me?.camps?.find((c) => c.location === "millbrook")?.holdings?.find((h) => h.material === material)?.balance ?? 0;
const after = (await graphql(token, heroQuery)).data?.me;
check(result.credited.every((r) => balance(after, r.material) === balance(home, r.material) + r.amount), `the camp's holdings rose by what was credited`);

const gained = expected.xp.find((x) => x.heroId === party.id)?.xp ?? 0;
const villager = after?.heroes?.find((h) => h.id === party.id);
check(gained > 0 && villager?.xp === party.xp + gained && villager.level === Math.max(party.level, levelForXp(party.xp + gained)) && villager.status === "ALIVE", `the villager came home with ${gained} XP, at level ${villager?.level} (${villager?.xp} XP)`);
const free = await graphql(token, `{ me { openAdventure { id } } }`);
check(free.data?.me?.openAdventure === null, `no adventure is open after the settlement`);

const repeated = await graphql(token, submitMutation, { id, log: [] });
const unchanged = (await graphql(token, heroQuery)).data?.me;
check(!repeated.errors && JSON.stringify(repeated.data.submitAdventure.result) === JSON.stringify(result) && JSON.stringify(unchanged) === JSON.stringify(after), `a repeated submit answers the settled result and pays nothing (${repeated.ms} ms)`);

// Paid recruitment (Issue-82): the timber run pays for a second villager,
// 20 timber debited while the first lives. It is retired at once, on every
// stack, so dev's test user never fills its hall.
const paid = await graphql(token, recruitMutation, { id: crypto.randomUUID() });
const bought = paid.data?.recruitHero;
check(!paid.errors && bought?.status === "ALIVE", `recruitHero sold a second villager, ${bought?.name}, while one lives (${paid.ms} ms)`);
const paidFor = (await graphql(token, heroQuery)).data?.me;
check(balance(paidFor, "timber") === balance(unchanged, "timber") - 20, `the camp paid 20 timber for it: ${balance(unchanged, "timber")} to ${balance(paidFor, "timber")}`);
const dismissed = await graphql(token, `mutation($id: String!) { retireHero(heroId: $id) { status } }`, { id: bought.id });
check(dismissed.data?.retireHero?.status === "RETIRED", `the paid villager retired, leaving the hall as it was (${dismissed.ms} ms)`);

// Building (Issue-93): the mine costs one timber run, 60 timber and 3 cloth.
// The test user keeps its camp from run to run, so a run that cannot pay yet
// checks the refusal, the run that can builds it, and every run after checks
// that a repeat charges nothing and that the mine has no second level here.
const facilitiesQuery = `{ me { camps { location holdings { material balance } facilities { kind level } } } }`;
const buildMutation = `mutation($level: Int!) { buildFacility(location: "millbrook", kind: "mine", level: $level) { location holdings { material balance } facilities { kind level } } }`;
const campIn = (me) => me?.camps?.find((c) => c.location === "millbrook");
const mineLevel = (camp) => camp?.facilities?.find((f) => f.kind === "mine")?.level;
const stockOf = (camp, material) => camp?.holdings?.find((h) => h.material === material)?.balance ?? 0;
const campBefore = campIn((await graphql(token, facilitiesQuery)).data?.me);
const [timberBefore, clothBefore] = [stockOf(campBefore, "timber"), stockOf(campBefore, "cloth")];
if (mineLevel(campBefore) === 0 && (timberBefore < 60 || clothBefore < 3)) {
  const poor = await graphql(token, buildMutation, { level: 1 });
  check(poor.errors?.[0]?.extensions?.code === "INSUFFICIENT_RESOURCES", `the mine is refused for want of resources, with ${timberBefore} timber and ${clothBefore} cloth; a later run builds it (${poor.ms} ms)`);
} else {
  if (mineLevel(campBefore) === 0) {
    const built = await graphql(token, buildMutation, { level: 1 });
    const camp = built.data?.buildFacility;
    check(!built.errors && mineLevel(camp) === 1, `buildFacility built the mine (${built.ms} ms)`);
    check(
      stockOf(camp, "timber") === timberBefore - 60 && stockOf(camp, "cloth") === clothBefore - 3,
      `the camp paid 60 timber and 3 cloth for it: timber ${timberBefore} to ${stockOf(camp, "timber")}, cloth ${clothBefore} to ${stockOf(camp, "cloth")}`,
    );
  }
  const now = campIn((await graphql(token, facilitiesQuery)).data?.me);
  const repeat = await graphql(token, buildMutation, { level: 1 });
  check(!repeat.errors && JSON.stringify(repeat.data?.buildFacility?.holdings) === JSON.stringify(now.holdings), `a repeat of the build answers the camp and charges nothing (${repeat.ms} ms)`);
  const higher = await graphql(token, buildMutation, { level: 2 });
  check(higher.errors?.[0]?.extensions?.code === "MAX_LEVEL", `the mine has no second level here (${higher.ms} ms)`);
}

// The timeline, read back through the hub from the replay bucket.
const read = await graphql(token, `query($id: String!) { adventure(id: $id) { id status timeline } }`, { id });
const timeline = read.data?.adventure?.timeline;
check(!read.errors && timeline?.version === config.version && timeline.seed === seed && timeline.jobId === job && timeline.events?.length > 0, `adventure(id) reads the stored timeline: ${timeline?.events?.length} events, version ${timeline?.version} (${read.ms} ms)`);
check(timeline.events.at(-1)?.kind === "adventure-end" && timeline.events.at(-1).outcome === "complete", `the timeline ends as the result does`);

// Both routes (decision 0030). /graphql runs this deploy. /previous/graphql
// runs the deploy before it: a stack's first apply points both at one
// version, and every later deploy leaves the one before at previous. The
// first deploy after Issue-114 has a previous from before the version
// field, which answers only through the outdated flag.
const currentVersion = await graphql(token, `{ version }`);
check(currentVersion.data?.version === config.version, `/graphql answers this deploy's version ${currentVersion.data?.version} (${currentVersion.ms} ms)`);
const previousVersion = await graphql(token, `{ version }`, {}, { "heat-version": config.version }, previousUrl);
if (previousVersion.data?.version) {
  const same = previousVersion.data.version === config.version;
  check(/^[0-9a-f]{40}$/.test(previousVersion.data.version), `/previous/graphql answers the previous deploy's version ${previousVersion.data.version}${same ? ", this one's: the stack's first deploy" : ""} (${previousVersion.ms} ms)`);
} else {
  check(previousVersion.extensions?.outdated === true, `/previous/graphql answers a deploy from before the version field, another version by its outdated flag (${previousVersion.ms} ms)`);
}

console.log("stack test passed");
