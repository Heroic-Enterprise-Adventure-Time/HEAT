#!/usr/bin/env sh
# Keeps one comment on a pull request: the comment whose body starts with the
# marker is edited in place, and posted when there is none, so that a comment
# a run refreshes stays one comment however many runs there are. The body
# file starts with the marker, an HTML comment a reader does not see.
#
# Usage: scripts/upsert-pr-comment.sh <pull request number> <marker> <body file> <what the comment is>
#   what the comment is   a few words for the log line, "the plan comment"
#
# From the environment: GH_TOKEN, with pull-requests: write, and GITHUB_REPOSITORY.
set -eu

pr_number="${1:?pull request number}"
marker="${2:?marker}"
body="${3:?body file}"
what="${4:?what the comment is}"

existing="$(gh api "repos/$GITHUB_REPOSITORY/issues/$pr_number/comments" --paginate \
  --jq "[.[] | select(.body | startswith(\"$marker\"))] | first | .id // empty")"
if [ -n "$existing" ]; then
  gh api --method PATCH "repos/$GITHUB_REPOSITORY/issues/comments/$existing" -F "body=@$body" > /dev/null
  echo "updated $what $existing on pull request $pr_number"
else
  gh api --method POST "repos/$GITHUB_REPOSITORY/issues/$pr_number/comments" -F "body=@$body" > /dev/null
  echo "posted $what on pull request $pr_number"
fi
