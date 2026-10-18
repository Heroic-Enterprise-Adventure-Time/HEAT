import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * The per-issue sandbox stacks, from the command line (decision 0018). The
 * one root terraform/environment/sandbox serves every stack; what tells
 * them apart is the issue number, which names the stack (heat-sb<issue>)
 * and its state key (environment/sandbox/<issue>/terraform.tfstate). This
 * script derives that number from the branch, so a person, the agent and
 * the workflow run init and plan against the right stack without typing
 * either, and cannot type them inconsistently.
 *
 * Usage: node scripts/sandbox.mjs <command> [--issue N | --branch NAME] [-- <terraform args>]
 *
 *   issue        print the issue number
 *   key          print the state key
 *   name         print the stack name
 *   init         terraform init with the state key
 *   plan         terraform plan (add -lock=false after -- for the plan role)
 *   apply        terraform apply; pass a saved plan after --
 *   destroy      terraform destroy
 *   output       terraform output; pass -raw <name> after --
 *   cap N        fail when N or more other stacks have state, naming them
 *   orphans      print the issue numbers that have state and no branch
 *
 * The branch is the current one unless --branch is given; the workflow
 * passes the ref it was triggered for, since a delete event has no branch
 * to check out. The account id reaches Terraform as TF_VAR_workload_account_id
 * from the caller's environment; the AWS CLI calls use the same credentials
 * Terraform does. Nothing here is specific to a laptop or to the runner.
 */

const ROOT = "terraform/environment/sandbox";
const STATE_BUCKET = "heat-platform-terraform-state";
const STATE_PREFIX = "environment/sandbox/";
const repoRoot = fileURLToPath(new URL("../", import.meta.url));

const args = process.argv.slice(2);
const command = args.shift();
const passthrough = [];
let issueArg;
let branchArg;
let capLimit;

while (args.length > 0) {
  const a = args.shift();
  if (a === "--") {
    passthrough.push(...args);
    break;
  } else if (a === "--issue") {
    issueArg = args.shift();
  } else if (a === "--branch") {
    branchArg = args.shift();
  } else if (command === "cap" && capLimit === undefined) {
    capLimit = a;
  } else {
    fail(`unexpected argument ${a}`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** <type>/<issue>-<description>, the branch shape code-changes rule 5 requires. */
export function issueFromBranch(branch) {
  const m = /^(feat|fix|docs|infra|chore|hotfix)\/(\d+)-[A-Za-z0-9._-]+$/.exec(branch);
  return m ? Number(m[2]) : undefined;
}

function currentBranch() {
  return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
}

function resolveIssue() {
  if (issueArg !== undefined) {
    if (!/^\d+$/.test(issueArg)) fail(`--issue must be a whole number, got ${issueArg}`);
    return Number(issueArg);
  }
  const branch = branchArg ?? currentBranch();
  const issue = issueFromBranch(branch);
  if (issue === undefined) fail(`branch "${branch}" is not <type>/<issue>-<description>; pass --issue N`);
  return issue;
}

const stateKey = (issue) => `${STATE_PREFIX}${issue}/terraform.tfstate`;
const stackName = (issue) => `heat-sb${issue}`;

function terraform(tfArgs) {
  const r = spawnSync("terraform", [`-chdir=${ROOT}`, ...tfArgs], { cwd: repoRoot, stdio: "inherit" });
  if (r.error) fail(`could not run terraform: ${r.error.message}`);
  process.exit(r.status ?? 1);
}

/** Issue numbers with a state object under the sandbox prefix; base/ is not a stack. */
function issuesWithState() {
  const out = execFileSync(
    "aws",
    ["s3api", "list-objects-v2", "--bucket", STATE_BUCKET, "--prefix", STATE_PREFIX, "--query", "Contents[].Key", "--output", "json"],
    { encoding: "utf8" },
  );
  const keys = JSON.parse(out || "[]") ?? [];
  const issues = new Set();
  for (const key of keys) {
    const m = new RegExp(`^${STATE_PREFIX}(\\d+)/terraform\\.tfstate$`).exec(key);
    if (m) issues.add(Number(m[1]));
  }
  return [...issues].sort((a, b) => a - b);
}

/** Whether any branch on origin carries this issue number. */
function branchExists(issue) {
  const out = execFileSync("git", ["ls-remote", "--heads", "origin", `refs/heads/*/${issue}-*`], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return out.trim().length > 0;
}

switch (command) {
  case "issue":
    console.log(resolveIssue());
    break;
  case "key":
    console.log(stateKey(resolveIssue()));
    break;
  case "name":
    console.log(stackName(resolveIssue()));
    break;
  case "init":
    terraform(["init", "-input=false", "-reconfigure", `-backend-config=key=${stateKey(resolveIssue())}`, ...passthrough]);
    break;
  case "plan":
  case "apply":
  case "destroy": {
    const issue = resolveIssue();
    // A saved plan carries its variables; apply <plan> refuses -var.
    const hasSavedPlan = command === "apply" && passthrough.some((a) => !a.startsWith("-"));
    terraform([command, "-input=false", ...(hasSavedPlan ? [] : [`-var=issue=${issue}`]), ...passthrough]);
    break;
  }
  case "output":
    terraform(["output", ...passthrough]);
    break;
  case "cap": {
    // The cap of decision 0018: this stack may be created or updated only
    // while fewer than N other stacks have state. base/ is not a stack and
    // this issue's own state does not count against it, so a re-apply of an
    // existing stack is never refused by the cap.
    const limit = Number(capLimit);
    if (!Number.isInteger(limit) || limit < 1) fail("cap needs a positive whole number");
    const issue = resolveIssue();
    const others = issuesWithState().filter((n) => n !== issue);
    if (others.length >= limit) {
      fail(
        `sandbox stack cap: ${others.length} other stack(s) have state and the cap is ${limit}: ` +
          others.map(stackName).join(", ") +
          ". Delete a merged branch, or wait for the weekly sweep.",
      );
    }
    console.log(`sandbox stack cap: ${others.length} other stack(s) of ${limit}; ${stackName(issue)} may proceed`);
    break;
  }
  case "orphans": {
    // Stacks whose branch is gone: the weekly sweep destroys these, in case
    // a branch's delete event was missed (decision 0018).
    const orphans = issuesWithState().filter((n) => !branchExists(n));
    for (const n of orphans) console.log(n);
    break;
  }
  default:
    fail("usage: node scripts/sandbox.mjs <issue|key|name|init|plan|apply|destroy|output|cap N|orphans> [--issue N | --branch NAME] [-- terraform args]");
}
