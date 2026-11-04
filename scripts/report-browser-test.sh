#!/usr/bin/env sh
# Puts the browser test's log on the run's page, beside the stack test's, and
# says where a failed run's encrypted trace is (decision 0045). Its own step,
# so the log arrives when the test fails, which ends the test's step.
#
# Usage: scripts/report-browser-test.sh <log file> <the test's outcome> <results directory>
set -eu

log="${1:?log file}"
outcome="${2:?outcome}"
results="${3:?results directory}"

{
  echo
  echo "### Browser test: $outcome"
  echo
  echo "\`packages/client/e2e\`, headless Chromium, through the stack's hostname."
  if [ "$outcome" = failure ] && [ -d "$results" ]; then
    echo
    echo "The trace is the run's \`browser-trace\` artifact, encrypted; \`scripts/seal-browser-trace.sh\` says how to read it."
  fi
  echo
  echo '```text'
  cat "$log"
  echo '```'
} >> "$GITHUB_STEP_SUMMARY"
