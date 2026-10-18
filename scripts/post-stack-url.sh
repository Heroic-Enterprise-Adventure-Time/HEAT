#!/usr/bin/env sh
# Writes the stack's URL as one comment on the branch's pull request, edited
# in place, so the reviewer finds the running change from the pull request
# (code-changes rule 24; decision 0018). Called by .github/workflows/sandbox.yml
# twice: from the apply job after every push, when the branch has an open
# pull request, and from the small job that runs when a pull request is
# opened or reopened, so the comment exists from the pull request's first
# minute. With no pull request the script says so and exits 0.
#
# Usage: scripts/post-stack-url.sh <issue> <site url> [pull request number]
#   issue      the issue number, which names the stack heat-sb<issue>
#   site url   https://<issue>.heat-sb.dcg-games.com
#   number     the pull request; found from the branch when not given
#
# From the environment: GH_TOKEN, GITHUB_REPOSITORY, GITHUB_REF_NAME (the
# branch, for the lookup), GITHUB_SERVER_URL and GITHUB_RUN_ID.
set -eu

issue="${1:?issue}"
site_url="${2:?site url}"
pr_number="${3:-}"

if [ -z "$pr_number" ]; then
  pr_number="$(gh pr list --repo "$GITHUB_REPOSITORY" --head "$GITHUB_REF_NAME" --state open --json number --jq '.[0].number // empty')"
fi
if [ -z "$pr_number" ]; then
  echo "no open pull request for $GITHUB_REF_NAME; the URL comment waits for one"
  exit 0
fi

marker="<!-- heat-stack-url -->"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
{
  echo "$marker"
  echo "### Stack \`heat-sb$issue\`"
  echo
  echo "The branch's stack serves at $site_url: the page at \`/\`, the API at \`/graphql\` (POST with a Bearer token from the base's \`ci\` client), \`/config.json\` for the client."
  echo
  echo "Re-applied and re-tested on every push; destroyed when the branch is deleted. [Latest run]($GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID)."
} > "$work/comment.md"

existing="$(gh api "repos/$GITHUB_REPOSITORY/issues/$pr_number/comments" --paginate \
  --jq "[.[] | select(.body | startswith(\"$marker\"))] | first | .id // empty")"
if [ -n "$existing" ]; then
  gh api --method PATCH "repos/$GITHUB_REPOSITORY/issues/comments/$existing" -F "body=@$work/comment.md" > /dev/null
  echo "updated the stack URL comment $existing on pull request $pr_number"
else
  gh api --method POST "repos/$GITHUB_REPOSITORY/issues/$pr_number/comments" -F "body=@$work/comment.md" > /dev/null
  echo "posted the stack URL comment on pull request $pr_number"
fi
