#!/usr/bin/env sh
# Creates the test users of a user pool, idempotently, after terraform apply
# (decision 0020: test users are data, created by the apply job, not
# Terraform's). Each line of the list file is one email address; blank lines
# and lines starting with # are skipped. A user that exists is left as it is
# except for the password, which is set again, permanently, so a changed
# secret reaches every user on the next apply. No invitation is sent: the
# message action is SUPPRESS, and the address is marked verified, because
# nothing receives mail at these addresses.
#
# Usage: TEST_USER_PASSWORD=<secret> scripts/create-test-users.sh <user pool id> <list file>
#
# Runs under the apply role, whose boundary allows cognito-idp. The password
# comes from the environment, never from an argument, so it is not in the
# process list or the log.
set -eu

pool_id="${1:?user pool id}"
list_file="${2:?list file}"
: "${TEST_USER_PASSWORD:?TEST_USER_PASSWORD must be set}"

created=0
kept=0
while IFS= read -r line || [ -n "$line" ]; do
  email="$(printf '%s' "$line" | sed -e 's/#.*$//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  [ -z "$email" ] && continue

  if aws cognito-idp admin-get-user --user-pool-id "$pool_id" --username "$email" >/dev/null 2>&1; then
    kept=$((kept + 1))
  else
    aws cognito-idp admin-create-user \
      --user-pool-id "$pool_id" \
      --username "$email" \
      --user-attributes Name=email,Value="$email" Name=email_verified,Value=true \
      --message-action SUPPRESS \
      >/dev/null
    created=$((created + 1))
  fi

  aws cognito-idp admin-set-user-password \
    --user-pool-id "$pool_id" \
    --username "$email" \
    --password "$TEST_USER_PASSWORD" \
    --permanent
  echo "test user $email: ready"
done < "$list_file"

echo "test users: $created created, $kept already existed, every password set"
