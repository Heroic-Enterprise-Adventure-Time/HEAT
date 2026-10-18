#!/usr/bin/env sh
# Writes the release's tag and its GitHub Release after prod is applied and
# its smoke test has passed (decision 0021): v<YYYY>.<MM>.<DD> on the merge
# commit, with .<n> appended for the second and later releases of a day, and
# a Release whose notes are the release pull request's title and body plus
# the run that applied it. The tag records what was released; it triggers
# nothing. Run by the last job of .github/workflows/release.yml with a token
# that may write contents; events raised by that token start no workflow.
#
# Usage: scripts/tag-release.sh <merge commit sha>
#
# Needs GH_TOKEN, GITHUB_REPOSITORY, GITHUB_SERVER_URL and GITHUB_RUN_ID,
# and the repository's tags fetched (git fetch --tags).
set -eu

sha="${1:?merge commit sha}"
: "${GH_TOKEN:?GH_TOKEN must be set}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY must be set}"

day="v$(date -u +%Y.%m.%d)"
tag="$day"
n=1
while git rev-parse -q --verify "refs/tags/$tag" >/dev/null; do
  tag="$day.$n"
  n=$((n + 1))
done

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

number="$(gh api "repos/$GITHUB_REPOSITORY/commits/$sha/pulls" --jq '[.[] | select(.base.ref == "release" and .merged_at != null)] | .[0].number // empty')"
if [ -n "$number" ]; then
  {
    echo "Release pull request PR-$number: $(gh pr view "$number" --json title --jq .title)"
    echo
    gh pr view "$number" --json body --jq .body
  } > "$work/notes.md"
  pr_line="the merge of PR-$number"
else
  echo "No merged pull request to release is associated with $sha." > "$work/notes.md"
  pr_line="a push to release"
fi
{
  echo
  echo "---"
  echo
  echo "Applied to prod by $pr_line, run $GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID, as $tag on $sha."
} >> "$work/notes.md"

# The tag does not exist yet: gh creates it on the target when it creates
# the Release.
gh release create "$tag" --target "$sha" --title "$tag" --notes-file "$work/notes.md"
echo "tagged $sha as $tag and created its GitHub Release"
echo "Released as \`$tag\`: $GITHUB_SERVER_URL/$GITHUB_REPOSITORY/releases/tag/$tag" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
