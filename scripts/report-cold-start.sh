#!/usr/bin/env sh
# Reads the cold start of a function from its log after the stack test and
# writes it to the job summary. Lambda writes one REPORT line per
# invocation; the first after a deploy carries "Init Duration", the time to
# start the runtime and load the bundle before the handler ran. The log
# lags the invocation by a few seconds, so this polls for up to a minute.
# When no line since the given time carries an Init Duration, the function
# was already warm, which a re-apply without a code change can leave it.
#
# Usage: scripts/report-cold-start.sh <log group> <since, epoch milliseconds>
set -eu

log_group="${1:?log group}"
since="${2:?since epoch ms}"

attempt=0
while [ "$attempt" -lt 12 ]; do
  lines="$(MSYS_NO_PATHCONV=1 aws logs filter-log-events --log-group-name "$log_group" --start-time "$since" --filter-pattern "REPORT" --query 'events[].message' --output text 2>/dev/null || true)"
  if [ -n "$lines" ]; then
    # One REPORT per line, its fields tab-separated; the whole line is matched.
    cold="$(printf '%s\n' "$lines" | tr '\t' ' ' | grep -m1 'Init Duration' || true)"
    if [ -n "$cold" ]; then
      init="$(printf '%s' "$cold" | sed -E 's/.*Init Duration: ([0-9.]+) ms.*/\1/')"
      duration="$(printf '%s' "$cold" | sed -E 's/.*REPORT.*[^d] Duration: ([0-9.]+) ms.*Billed.*/\1/')"
      memory="$(printf '%s' "$cold" | sed -E 's/.*Max Memory Used: ([0-9]+) MB.*/\1/')"
      echo "Cold start: ${init} ms of initialization, ${duration} ms for the first request, ${memory} MB used." | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
      exit 0
    fi
    # Lines exist but none with an Init Duration: the function was warm.
    if [ "$attempt" -ge 3 ]; then
      echo "No cold start in this run: the function was warm (no code change since the last invocation)." | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
      exit 0
    fi
  fi
  attempt=$((attempt + 1))
  sleep 5
done
echo "No REPORT line reached the log within a minute; the cold start is not recorded for this run." | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
