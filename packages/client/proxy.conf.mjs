// The dev server's proxy: /graphql, /previous/graphql and /config.json go to the branch's
// sandbox stack, so the local client is that stack's client, signing in
// through the stack's browser app client with the http://localhost:4200
// callback (decision 0018; docs/process/development.md). The stack follows
// from the issue number in the branch name, <type>/<issue>-<description>
// (docs/process/code-changes.md, rule 5), read here the way
// scripts/sandbox.mjs reads it. HEAT_STACK names another stack's origin
// instead, for looking at a colleague's branch.
import { execFileSync } from "node:child_process";

function stackOrigin() {
  if (process.env["HEAT_STACK"]) return process.env["HEAT_STACK"];
  const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim();
  const match = /^(?:feat|fix|docs|infra|chore|hotfix)\/(\d+)-/.exec(branch);
  if (!match) {
    throw new Error(`the branch ${branch} names no issue, so there is no stack to proxy to; set HEAT_STACK=https://<issue>.heat-sb.dcg-games.com`);
  }
  return `https://${match[1]}.heat-sb.dcg-games.com`;
}

const target = stackOrigin();
console.log(`proxying /graphql, /previous/graphql and /config.json to ${target}`);

export default {
  "/graphql": { target, changeOrigin: true, secure: true },
  "/previous/graphql": { target, changeOrigin: true, secure: true },
  "/config.json": { target, changeOrigin: true, secure: true },
};
