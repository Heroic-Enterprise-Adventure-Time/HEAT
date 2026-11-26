#!/usr/bin/env sh
# Fetches the last trace report kept from main: the trace-report artifact of
# the latest finished Deploy run on a push to main that has one, which is
# dev's figures for the commit that run deployed (decision 0056). A branch's
# run sets it beside its own, and dev's run beside its own, the run in
# progress being left out because it has not finished. Only a push to main is
# read, so a pull request's run cannot put a report where this looks.
#
# Leaves <directory>/trace-report.json, or nothing when no run in the last
# twenty has the artifact, which is not a failure: scripts/trace-report.mjs
# then reports alone.
#
# Usage: scripts/fetch-trace-baseline.sh <directory>
# From the environment: GH_TOKEN, with actions: read, and GITHUB_REPOSITORY.
set -eu

directory="${1:?directory}"
mkdir -p "$directory"

runs="$(gh run list --repo "$GITHUB_REPOSITORY" --workflow deploy.yml --branch main --event push --status completed --limit 20 --json databaseId --jq '.[].databaseId')"
for run in $runs; do
  if refusal="$(gh run download "$run" --repo "$GITHUB_REPOSITORY" --name trace-report --dir "$directory" 2>&1)"; then
    echo "the last trace report kept from main is run $run's"
    exit 0
  fi
  # A run without the artifact is expected; anything else, a token without
  # actions: read among them, is said, and the report still goes out alone.
  case "$refusal" in
    *"no artifact"* | *"no valid artifacts"*) ;;
    *) echo "run $run: $refusal" >&2 ;;
  esac
done
echo "no trace report kept in main's last twenty Deploy runs"
