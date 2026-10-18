#!/usr/bin/env sh
# The release guard (decision 0021, Issue-41): what may reach release, and so
# prod, is main or a hotfix branch, and nothing else; and release may not
# have drifted from main. Run by .github/workflows/release.yml twice: on the
# pull request to release, where its check is one the release ruleset
# requires, and again on the push to release before the apply, as a second
# look that does not depend on the ruleset.
#
# Usage: scripts/check-release-source.sh pull-request <head ref> <head sha>
#        scripts/check-release-source.sh push <merge commit sha>
#
# pull-request: the head is main or hotfix/<issue>-<name> (code-changes rule
#   5), and release carries no content beyond its merge base with the head.
#   A release merge commit has no content of its own, so routine releases
#   pass; a hotfix merged to release and not yet to main fails with what to
#   do, because main is the truth of what runs in prod and the release pull
#   request's diff must be the whole change. Needs origin/release fetched
#   and the head sha reachable.
# push: the pull request GitHub associates with the merge commit has base
#   release and a head of the same two shapes. The API, not the git graph,
#   because the hotfix branch is deleted after its merge (rule 14) and a
#   graph check would then find nothing. Needs GH_TOKEN and GITHUB_REPOSITORY.
set -eu

mode="${1:?pull-request or push}"

allowed_head() {
  case "$1" in
    main) return 0 ;;
    hotfix/[0-9]*-*) return 0 ;;
  esac
  return 1
}

case "$mode" in
  pull-request)
    head_ref="${2:?head ref}"
    head_sha="${3:?head sha}"
    if ! allowed_head "$head_ref"; then
      echo "A release comes from main or from hotfix/<issue>-<name>, not from $head_ref." >&2
      exit 1
    fi
    base="$(git merge-base origin/release "$head_sha")"
    if ! git diff --quiet "$base" origin/release; then
      echo "release carries changes that are not on $head_ref:" >&2
      git diff --stat "$base" origin/release >&2
      echo "Merge release into main through a pull request first (decision 0021), then release again." >&2
      exit 1
    fi
    echo "release source: $head_ref at $head_sha; release holds nothing beyond their merge base $base"
    ;;
  push)
    sha="${2:?merge commit sha}"
    : "${GH_TOKEN:?GH_TOKEN must be set}"
    : "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY must be set}"
    work="$(mktemp -d)"
    trap 'rm -rf "$work"' EXIT
    gh api "repos/$GITHUB_REPOSITORY/commits/$sha/pulls" --jq '[.[] | select(.base.ref == "release" and .merged_at != null)] | map("\(.number) \(.head.ref)") | .[]' > "$work/pulls"
    if [ ! -s "$work/pulls" ]; then
      echo "No merged pull request to release is associated with $sha; prod is applied only from one (decision 0021)." >&2
      exit 1
    fi
    # Read from the file, not a pipe, so that exit ends the script.
    while read -r number head_ref; do
      if ! allowed_head "$head_ref"; then
        echo "Pull request $number to release came from $head_ref, not from main or hotfix/<issue>-<name>." >&2
        exit 1
      fi
      echo "release source: pull request $number from $head_ref, merged as $sha"
    done < "$work/pulls"
    ;;
  *)
    echo "usage: scripts/check-release-source.sh pull-request <head ref> <head sha> | push <merge commit sha>" >&2
    exit 2
    ;;
esac
