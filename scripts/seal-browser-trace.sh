#!/usr/bin/env sh
# Packs the browser test's results and encrypts them to the committed
# certificate, so that a failed run's trace can be a run artifact. The
# repository is public and so are its artifacts, and a trace holds the test
# user's password, its tokens and every response (decision 0045). Encryption
# to a public key needs no secret in the workflow; the private key stays out
# of the repository, git-ignored in docs/private/heat-browser-trace-key.pem.
#
# Usage: scripts/seal-browser-trace.sh <results directory> <output file>
#
# Read one back, from the repository root, after downloading the artifact:
#   openssl cms -decrypt -binary -inform DER -in browser-trace.tgz.cms \
#     -inkey docs/private/heat-browser-trace-key.pem -out browser-trace.tgz
#   tar -xzf browser-trace.tgz
#   npx playwright show-trace <test's directory>/trace.zip
set -eu

results="${1:?results directory}"
output="${2:?output file}"
recipient="$(dirname "$0")/browser-trace-recipient.pem"

# A test that fails before it starts writes no results, and has nothing to keep.
if [ ! -d "$results" ]; then
  echo "no results in $results: nothing to seal"
  exit 0
fi

packed="$(mktemp)"
trap 'rm -f "$packed"' EXIT

tar -czf "$packed" -C "$(dirname "$results")" "$(basename "$results")"
openssl cms -encrypt -binary -aes-256-cbc -outform DER -in "$packed" -out "$output" "$recipient"
echo "sealed $results into $output"
