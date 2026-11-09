#!/usr/bin/env sh
# Writes the release's tag and its GitHub Release after prod is applied and
# its smoke test has passed (decision 0021): v<YYYY>.<MM>.<DD> on the merge
# commit, with .<n> appended for the second and later releases of a day, and
# a Release whose notes are the release pull request's title and body plus
# the run that applied it. The tag records what was released; it triggers
# nothing. Run by the last job of .github/workflows/release.yml with a token
# that may write contents; events raised by that token start no workflow.
#
# A re-run is safe (docs/process/deployment.md, rule 6). A release tag
# already on the commit is the release's tag, whatever day the re-run is
# on, and only what is missing is made: the Release for a tag that has
# none, as when GitHub answered 500 after making the tag (Issue-219), and
# nothing when both are there, which answers success.
#
# Usage: scripts/tag-release.sh <merge commit sha>
#
# Needs GH_TOKEN, GITHUB_REPOSITORY, GITHUB_SERVER_URL and GITHUB_RUN_ID,
# and the repository's tags fetched (git fetch --tags).
set -eu

sha="${1:?merge commit sha}"
: "${GH_TOKEN:?GH_TOKEN must be set}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY must be set}"

summary() {
  echo "Released as \`$tag\`: $GITHUB_SERVER_URL/$GITHUB_REPOSITORY/releases/tag/$tag" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
}

tag="$(git tag --points-at "$sha" --list 'v[0-9][0-9][0-9][0-9].[0-9][0-9].[0-9][0-9]*' | sort -V | tail -n 1)"
if [ -n "$tag" ]; then
  # A failed view is read as no Release: if one is there after all, the
  # create below refuses it and the job fails, to be re-run.
  if gh release view "$tag" --json tagName >/dev/null 2>&1; then
    echo "$sha is already released as $tag, with its GitHub Release; nothing to write"
    summary
    exit 0
  fi
  echo "$sha is already tagged $tag; writing its missing GitHub Release"
else
  day="v$(date -u +%Y.%m.%d)"
  tag="$day"
  n=1
  while git rev-parse -q --verify "refs/tags/$tag" >/dev/null; do
    tag="$day.$n"
    n=$((n + 1))
  done
fi

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

if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
  # The tag is on the commit already: --verify-tag makes the Release on it
  # and refuses rather than make a tag.
  gh release create "$tag" --verify-tag --title "$tag" --notes-file "$work/notes.md"
  echo "created the GitHub Release for $sha's existing tag $tag"
else
  # The tag does not exist yet: gh creates it on the target when it
  # creates the Release.
  gh release create "$tag" --target "$sha" --title "$tag" --notes-file "$work/notes.md"
  echo "tagged $sha as $tag and created its GitHub Release"
fi
summary
