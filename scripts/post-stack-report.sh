#!/usr/bin/env sh
# Writes the stack's report, the cold start and what each request did, as one
# comment on the branch's pull request, edited in place, so the reviewer reads
# it beside the diff that caused it (decision 0056). Called by
# .github/actions/stack-report after every push's stack test. With no pull
# request the script says so and exits 0: the report is in the run's summary,
# and the comment arrives with the next push, or when the report's job is run
# again once the pull request is open.
#
# Usage: scripts/post-stack-report.sh <stack> <cold start file> <trace report file>
#
# From the environment: GH_TOKEN, GITHUB_REPOSITORY, GITHUB_REF_NAME (the
# branch, for the lookup), GITHUB_SHA, GITHUB_SERVER_URL and GITHUB_RUN_ID.
set -eu

stack="${1:?stack}"
cold_start="${2:?cold start file}"
traces="${3:?trace report file}"

pr_number="$(gh pr list --repo "$GITHUB_REPOSITORY" --head "$GITHUB_REF_NAME" --state open --json number --jq '.[0].number // empty')"
if [ -z "$pr_number" ]; then
  echo "no open pull request for $GITHUB_REF_NAME; the report is in the run's summary"
  exit 0
fi

marker="<!-- heat-stack-report -->"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
{
  echo "$marker"
  echo "### What the last push's run measured on \`$stack\`"
  echo
  echo "Commit $(printf '%s' "$GITHUB_SHA" | cut -c1-7), [its run]($GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID). Read beside the diff; it gates nothing, because a duration on Lambda varies from run to run."
  echo
  cat "$cold_start"
  echo
  cat "$traces"
} > "$work/comment.md"

sh "$(dirname "$0")/upsert-pr-comment.sh" "$pr_number" "$marker" "$work/comment.md" "the stack report comment"
