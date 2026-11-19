#!/usr/bin/env sh
# Keeps one comment on a pull request: the comment whose body starts with the
# marker is edited in place, and posted when there is none, so that a comment
# a run refreshes stays one comment however many runs there are. The body
# file starts with the marker, an HTML comment a reader does not see.
#
# Two runs that start seconds apart can each find no comment and each post
# one, as PR-333's two plans of one root did when it was opened and pushed to
# at once. That is tolerated, not prevented: it is rare, each comment names
# its commit, and the stale one is deleted by hand. What it must never do is
# fail a run, so the oldest marked comment is the one edited, and only that
# one: gh applies --jq to each page of the listing, so with a duplicate on
# another page the filter alone would answer two ids.
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

# Two commands, not a pipe: sh has no pipefail, and a failed listing piped
# into head would read as no comment and post a second one (Issue-137).
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
gh api "repos/$GITHUB_REPOSITORY/issues/$pr_number/comments" --paginate \
  --jq ".[] | select(.body | startswith(\"$marker\")) | .id" > "$work/ids.txt"
existing="$(head -n 1 "$work/ids.txt")"
if [ -n "$existing" ]; then
  gh api --method PATCH "repos/$GITHUB_REPOSITORY/issues/comments/$existing" -F "body=@$body" > /dev/null
  echo "updated $what $existing on pull request $pr_number"
else
  gh api --method POST "repos/$GITHUB_REPOSITORY/issues/$pr_number/comments" -F "body=@$body" > /dev/null
  echo "posted $what on pull request $pr_number"
fi
