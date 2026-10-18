#!/usr/bin/env sh
# The stack's own test user in the account's shared pool, minted by the job
# that applied the stack and deleted with the stack. No stored secret: the
# password is random, set permanently for this run, masked in the log, and
# handed to scripts/e2e.mjs through GITHUB_ENV as E2E_PASSWORD. The apply
# role may do this because the boundary allows cognito-idp, which is how the
# base's apply job creates the human test users too (decision 0020).
#
# Usage: scripts/e2e-user.sh ensure <pool name> <username>
#        scripts/e2e-user.sh delete <pool name> <username>
#
# The pool is found by name (heat-sb-base-users in the sandbox account), so
# the caller needs no state or output: the sweep deletes a user whose stack
# may already be gone.
set -eu

mode="${1:?ensure or delete}"
pool_name="${2:?pool name}"
username="${3:?username}"

pool_id="$(aws cognito-idp list-user-pools --max-results 60 --query "UserPools[?Name=='$pool_name'].Id | [0]" --output text)"
if [ -z "$pool_id" ] || [ "$pool_id" = "None" ]; then
  echo "no user pool named $pool_name" >&2
  exit 1
fi

case "$mode" in
  ensure)
    if ! aws cognito-idp admin-get-user --user-pool-id "$pool_id" --username "$username" >/dev/null 2>&1; then
      aws cognito-idp admin-create-user \
        --user-pool-id "$pool_id" \
        --username "$username" \
        --user-attributes Name=email,Value="$username" Name=email_verified,Value=true \
        --message-action SUPPRESS \
        >/dev/null
      echo "test user $username: created"
    else
      echo "test user $username: exists"
    fi
    # Cognito's default policy: at least eight characters with an upper-case
    # letter, a lower-case letter, a digit and a symbol. The prefix covers
    # the classes; the rest is 144 random bits.
    password="Aa1!$(node -e 'process.stdout.write(require("node:crypto").randomBytes(18).toString("base64url"))')"
    echo "::add-mask::$password"
    aws cognito-idp admin-set-user-password --user-pool-id "$pool_id" --username "$username" --password "$password" --permanent
    if [ -n "${GITHUB_ENV:-}" ]; then
      echo "E2E_PASSWORD=$password" >> "$GITHUB_ENV"
    else
      echo "E2E_PASSWORD set for this shell only when sourced; outside GitHub Actions use player1 and the owner's password" >&2
    fi
    echo "test user $username: password set for this run"
    ;;
  delete)
    if aws cognito-idp admin-get-user --user-pool-id "$pool_id" --username "$username" >/dev/null 2>&1; then
      aws cognito-idp admin-delete-user --user-pool-id "$pool_id" --username "$username"
      echo "test user $username: deleted"
    else
      echo "test user $username: already gone"
    fi
    ;;
  *)
    echo "usage: scripts/e2e-user.sh ensure|delete <pool name> <username>" >&2
    exit 2
    ;;
esac
