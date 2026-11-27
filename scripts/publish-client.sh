#!/usr/bin/env sh
# Publishes the Angular client to a stack's bucket after terraform apply,
# and writes config.json beside it from the stack's outputs, so that one
# client build serves any stack (decision 0018, Issue-39). Run by the apply
# job of .github/workflows/sandbox.yml with the apply role; the bucket and
# the distribution are Terraform's (terraform/modules/site), the objects
# are this script's, because the plan role may not read objects outside
# the state prefix and Terraform could not refresh them.
#
# Usage: scripts/publish-client.sh <bucket> <build dir> <graphql path> <user pool id> <client id> <login host> <password sign-in> <version>
#   bucket        the stack's client bucket, from the output client_bucket
#   build dir     what ng build wrote: packages/client/dist/client/browser
#   graphql path  the API's path on the stack's hostname, /graphql
#   user pool id  the base pool, from the output user_pool_id
#   client id     the stack's browser app client, from the output browser_client_id
#   login host    the pool's managed login host, from the output login_host
#   password sign-in  true or false, from the output password_sign_in: whether
#                 the login page offers email and password beside Google
#   version       the deploy's version, from the output app_version: the
#                 commit the workflow deployed, which the hub carries as
#                 HEAT_VERSION, so the client and the hub of one deploy
#                 agree (decision 0030)
#
# config.json is the client's whole knowledge of the stack it runs in
# (packages/client/src/app/config.ts reads it before the application
# starts): where the API is, which pool issues tokens, which client to sign
# in as and where, and whether to show the login page or go straight to
# Google, and which deploy it belongs to, which the client sends back on
# every request so the hub can say when it is outdated. None of it is secret; the browser carries all of it.
#
# Lifetimes, which the distribution's cache policy honours between one
# second and a year: the hashed assets are immutable for a year, since a
# new build is a new set of names; the page, the favicon and config.json
# are re-read within a minute, which is how a new build reaches the browser
# with no invalidation. The favicon is art (art/icons/favicon.png) but sits
# at a fixed address, /favicon.png, because browsers ask for it by name, and
# the build writes it there alone.
# Those three are excluded from the sync of the long-lived and written on
# their own. So is what the art build writes under a name that stays from
# build to build (Issue-205): every sprite set's atlas,
# art/<area>/<set>/sheet.json, which names the sheet's image, itself named
# for its pixels and kept for the year; art/facilities/pictures.json, which
# names each facility picture the same way, beside the row it stands on; and
# art/icons/pictures.json, which names each icon the same way (the review of
# PR-348); and art/portraits/pictures.json, which names each hero's portrait
# the same way (Issue-385). The frames' names are in the page's stylesheet,
# which is itself named for its contents.
#
# The order: everything long-lived first, with nothing deleted; then the
# short-lived files, each of which names long-lived ones, the atlases their
# images, the page its scripts; and only then are the earlier builds' files
# deleted. Deleting first, as the one sync used to, left an atlas of the
# last build naming an image already gone until the new atlas was written
# (the review of PR-334). A copy of a short-lived file that a browser or the
# distribution took in its last minute can still name a deleted one until
# that minute is over.
set -eu

bucket="${1:?bucket}"
build_dir="${2:?build dir}"
graphql_path="${3:?graphql path}"
user_pool_id="${4:?user pool id}"
client_id="${5:?client id}"
login_host="${6:?login host}"
password_sign_in="${7:?password sign-in}"
version="${8:?version}"

case "$password_sign_in" in
  true|false) ;;
  *) echo "password sign-in must be true or false, not $password_sign_in" >&2; exit 1 ;;
esac

case "$version" in
  *[!0-9a-f]*|"") echo "version must be a commit hash, not $version" >&2; exit 1 ;;
esac

[ -f "$build_dir/index.html" ] || { echo "$build_dir holds no index.html; is the client built?" >&2; exit 1; }

short="public, max-age=60"
long="public, max-age=31536000, immutable"

# What is written on its own, and so neither uploaded nor deleted by the syncs of the long-lived.
set -- --exclude index.html --exclude favicon.png --exclude config.json \
  --exclude "art/*/sheet.json" --exclude "art/*/pictures.json"

aws s3 sync "$build_dir" "s3://$bucket" --only-show-errors "$@" --cache-control "$long"

# The atlases and the indexes of the facilities' pictures and of the icons alone: everything else under art/ went with the sync above.
aws s3 sync "$build_dir/art" "s3://$bucket/art" --delete --only-show-errors \
  --exclude "*" --include "*/sheet.json" --include "*/pictures.json" \
  --cache-control "$short" --content-type "application/json"

aws s3 cp "$build_dir/index.html" "s3://$bucket/index.html" --only-show-errors \
  --cache-control "$short" --content-type "text/html; charset=utf-8"

aws s3 cp "$build_dir/favicon.png" "s3://$bucket/favicon.png" --only-show-errors \
  --cache-control "$short" --content-type "image/png"

config="$(mktemp)"
trap 'rm -f "$config"' EXIT
printf '{"graphqlPath":"%s","userPoolId":"%s","clientId":"%s","loginHost":"%s","passwordSignIn":%s,"version":"%s"}\n' "$graphql_path" "$user_pool_id" "$client_id" "$login_host" "$password_sign_in" "$version" >"$config"
aws s3 cp "$config" "s3://$bucket/config.json" --only-show-errors \
  --cache-control "$short" --content-type "application/json"

# Last, what earlier builds left: the same sync again, which finds nothing to upload and deletes what this build does not hold.
aws s3 sync "$build_dir" "s3://$bucket" --delete --only-show-errors "$@" --cache-control "$long"

echo "published the client to s3://$bucket with config.json: $(cat "$config")"
