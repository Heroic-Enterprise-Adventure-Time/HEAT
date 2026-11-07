#!/usr/bin/env sh
# Hands the stack test what the apply job read for it, across the job boundary
# (docs/process/best-practices.md, rule 13; decision 0046). The test runs
# downloaded code, so it runs in a job with no role and cannot read these
# itself. Nothing private passes between jobs and a public repository's
# artifacts are public, so the test user's password is encrypted with the
# repository secret HEAT_E2E_HANDOVER_KEY; the rest is not secret. The file is
# the run's stack-handover artifact, kept for a day.
#
# Usage: E2E_PASSWORD=<password> E2E_HANDOVER_KEY=<key> scripts/stack-handover.sh seal <file> <site url> <ci client id> <username>
#        E2E_HANDOVER_KEY=<key> scripts/stack-handover.sh open <file>
#
# open masks the password and writes everything to GITHUB_ENV for later steps:
# E2E_SITE_URL, E2E_CI_CLIENT_ID, E2E_USERNAME and E2E_PASSWORD. The password
# and the key travel by environment and stdin, so neither is in a process list.
set -eu

mode="${1:?seal or open}"
file="${2:?file}"
: "${E2E_HANDOVER_KEY:?The repository secret HEAT_E2E_HANDOVER_KEY is not set.}"

case "$mode" in
  seal)
    site_url="${3:?site url}"
    client_id="${4:?ci client id}"
    username="${5:?username}"
    : "${E2E_PASSWORD:?E2E_PASSWORD must be set}"
    sealed="$(printf '%s' "$E2E_PASSWORD" | openssl enc -aes-256-cbc -pbkdf2 -a -A -pass env:E2E_HANDOVER_KEY)"
    mkdir -p "$(dirname "$file")"
    {
      echo "E2E_SITE_URL=$site_url"
      echo "E2E_CI_CLIENT_ID=$client_id"
      echo "E2E_USERNAME=$username"
      echo "E2E_SEALED_PASSWORD=$sealed"
    } > "$file"
    echo "sealed the handover for $username"
    ;;
  open)
    sealed="$(sed -n 's/^E2E_SEALED_PASSWORD=//p' "$file")"
    password="$(printf '%s' "$sealed" | openssl enc -d -aes-256-cbc -pbkdf2 -a -A -pass env:E2E_HANDOVER_KEY)"
    echo "::add-mask::$password"
    {
      grep -v '^E2E_SEALED_PASSWORD=' "$file"
      echo "E2E_PASSWORD=$password"
    } >> "${GITHUB_ENV:?GITHUB_ENV must be set}"
    echo "opened the handover"
    ;;
  *)
    echo "usage: scripts/stack-handover.sh seal|open <file> ..." >&2
    exit 2
    ;;
esac
