#!/usr/bin/env sh
# Publishes the Angular client to a stack's bucket after terraform apply,
# and writes config.json beside it from the stack's outputs, so that one
# client build serves any stack (decision 0018, Issue-39). Run by the apply
# job of .github/workflows/sandbox.yml with the apply role; the bucket and
# the distribution are Terraform's (terraform/modules/site), the objects
# are this script's, because the plan role may not read objects outside
# the state prefix and Terraform could not refresh them.
#
# Usage: scripts/publish-client.sh <bucket> <build dir> <graphql path> <user pool id>
#   bucket        the stack's client bucket, from the output client_bucket
#   build dir     what ng build wrote: packages/client/dist/client/browser
#   graphql path  the API's path on the stack's hostname, /graphql
#   user pool id  the base pool, from the output user_pool_id
#
# Lifetimes, which the distribution's cache policy honours between one
# second and a year: the hashed assets are immutable for a year, since a
# new build is a new set of names; the page, the icon and config.json are
# re-read within a minute, which is how a new build reaches the browser
# with no invalidation. The sync deletes assets of earlier builds; the
# three short-lived objects are excluded from it and written on their own.
set -eu

bucket="${1:?bucket}"
build_dir="${2:?build dir}"
graphql_path="${3:?graphql path}"
user_pool_id="${4:?user pool id}"

[ -f "$build_dir/index.html" ] || { echo "$build_dir holds no index.html; is the client built?" >&2; exit 1; }

short="public, max-age=60"
long="public, max-age=31536000, immutable"

aws s3 sync "$build_dir" "s3://$bucket" --delete --only-show-errors \
  --exclude index.html --exclude favicon.ico --exclude config.json \
  --cache-control "$long"

aws s3 cp "$build_dir/index.html" "s3://$bucket/index.html" --only-show-errors \
  --cache-control "$short" --content-type "text/html; charset=utf-8"

if [ -f "$build_dir/favicon.ico" ]; then
  aws s3 cp "$build_dir/favicon.ico" "s3://$bucket/favicon.ico" --only-show-errors \
    --cache-control "$short" --content-type "image/x-icon"
fi

config="$(mktemp)"
trap 'rm -f "$config"' EXIT
printf '{"graphqlPath":"%s","userPoolId":"%s"}\n' "$graphql_path" "$user_pool_id" > "$config"
aws s3 cp "$config" "s3://$bucket/config.json" --only-show-errors \
  --cache-control "$short" --content-type "application/json"

echo "published the client to s3://$bucket with config.json: $(cat "$config")"
