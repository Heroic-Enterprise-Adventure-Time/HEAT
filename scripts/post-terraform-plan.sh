#!/usr/bin/env sh
# Writes a saved Terraform plan to the job summary (decision 0017, guardrail
# 4) and, when a pull request number is given, to one comment on that pull
# request, edited in place on every push so the pull request shows the
# current plan and not a history of them. The account id is replaced by
# "<account id>" in everything that leaves the runner (docs/README.md, rule
# 9). Called by both jobs of .github/workflows/deploy.yml.
#
# Usage: scripts/post-terraform-plan.sh <root> <plan file> <commit> <identity> [pull request number]
#   root       the permanent root's name under terraform/environment/
#   plan file  the saved plan, as written by terraform plan -out
#   commit     the commit the plan was made from
#   identity   "plan role" or "apply role", for the heading
#
# From the environment: ACCOUNT_ID (the id to replace), ENVIRONMENT (the
# GitHub environment, for the heading), GITHUB_STEP_SUMMARY, and for the
# comment GH_TOKEN, GITHUB_REPOSITORY, GITHUB_SERVER_URL and GITHUB_RUN_ID.
set -eu

root="${1:?root}"
plan_file="${2:?plan file}"
commit="${3:?commit}"
identity="${4:?identity}"
pr_number="${5:-}"
: "${ACCOUNT_ID:?ACCOUNT_ID must be set}"
: "${ENVIRONMENT:?ENVIRONMENT must be set}"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

terraform -chdir="terraform/environment/$root" show -no-color "$plan_file" \
  | sed "s/$ACCOUNT_ID/<account id>/g" > "$work/plan.txt"

summary="$(grep -E '^(Plan:|No changes\.)' "$work/plan.txt" | head -n 1 || true)"
: "${summary:=Plan written below.}"

if [ -n "$pr_number" ]; then
  heading="### Terraform plan: \`$root\`"
else
  heading="### Terraform plan: \`$root\`, applied by this run"
fi
line="Commit $commit, planned under the \`$ENVIRONMENT\` environment with the $identity. Allow-list check: passed."

{
  echo "$heading"
  echo
  echo "$line"
  echo
  echo "$summary"
  echo
  echo '```text'
  cat "$work/plan.txt"
  echo '```'
} >> "${GITHUB_STEP_SUMMARY:?GITHUB_STEP_SUMMARY must be set}"
echo "plan written to the job summary: $summary"

[ -n "$pr_number" ] || exit 0

# A pull request comment holds at most 65,536 characters; a plan that would
# not fit is cut, and the summary has the whole of it.
limit=60000
body_plan="$(head -c "$limit" "$work/plan.txt")"
if [ "$(wc -c < "$work/plan.txt")" -gt "$limit" ]; then
  body_plan="$body_plan

... cut here; the whole plan is in the job summary."
fi

marker="<!-- heat-plan:$root -->"
{
  echo "$marker"
  echo "$heading"
  echo
  echo "$line [Run]($GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID)."
  echo
  echo "<details><summary>$summary</summary>"
  echo
  echo '```text'
  echo "$body_plan"
  echo '```'
  echo
  echo "</details>"
} > "$work/comment.md"

existing="$(gh api "repos/$GITHUB_REPOSITORY/issues/$pr_number/comments" --paginate \
  --jq "[.[] | select(.body | startswith(\"$marker\"))] | first | .id // empty")"
if [ -n "$existing" ]; then
  gh api --method PATCH "repos/$GITHUB_REPOSITORY/issues/comments/$existing" -F "body=@$work/comment.md" > /dev/null
  echo "updated the plan comment $existing on pull request $pr_number"
else
  gh api --method POST "repos/$GITHUB_REPOSITORY/issues/$pr_number/comments" -F "body=@$work/comment.md" > /dev/null
  echo "posted the plan comment on pull request $pr_number"
fi
