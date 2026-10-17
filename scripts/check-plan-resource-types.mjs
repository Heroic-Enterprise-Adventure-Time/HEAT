import { readFileSync } from "node:fs";

/**
 * The plan-time allow-list check (decision 0017, guardrail 2). Reads a plan
 * as `terraform show -json` prints it and fails when any managed resource
 * the plan would create, update or replace has a type that is not listed in
 * terraform/allowed-resource-types.txt. A delete is allowed whatever the
 * type, so that removing something that should never have existed is never
 * blocked by the list that should have stopped it. Data sources are reads
 * and are not checked.
 *
 * Adding a type to the list is a reviewed change: the pull request that
 * introduces the resource adds the line, and the reviewer sees both.
 *
 * Usage: node scripts/check-plan-resource-types.mjs <plan.json> [allowed-resource-types.txt]
 */
const [planPath, listPath = new URL("../terraform/allowed-resource-types.txt", import.meta.url)] = process.argv.slice(2);
if (!planPath) {
  console.error("usage: node scripts/check-plan-resource-types.mjs <plan.json> [allowed-resource-types.txt]");
  process.exit(2);
}

const allowed = new Set(
  readFileSync(listPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter((line) => line.length > 0),
);

const plan = JSON.parse(readFileSync(planPath, "utf8"));
const offending = new Map();
for (const change of plan.resource_changes ?? []) {
  if (change.mode !== "managed") continue;
  const actions = change.change?.actions ?? [];
  const writes = actions.some((action) => action === "create" || action === "update");
  if (!writes) continue;
  if (allowed.has(change.type)) continue;
  const addresses = offending.get(change.type) ?? [];
  addresses.push(change.address);
  offending.set(change.type, addresses);
}

if (offending.size === 0) {
  const touched = new Set((plan.resource_changes ?? []).filter((c) => c.mode === "managed").map((c) => c.type));
  console.log(`allow-list check passed: ${touched.size} resource type(s) in the plan, all listed or only deleted`);
  process.exit(0);
}

console.error("allow-list check failed: the plan creates or changes resources of types not in terraform/allowed-resource-types.txt");
for (const [type, addresses] of offending) {
  console.error(`  ${type}`);
  for (const address of addresses) console.error(`    ${address}`);
}
console.error("Add the type to the list in a reviewed change, or remove the resource.");
process.exit(1);
