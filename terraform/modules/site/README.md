# The site module

One environment's hostname: the client bucket, the CloudFront distribution that serves the Angular client from it and routes the API's paths to the environment's HTTP API, and the hostname's records in the account's zone. Composed by the environment module (`terraform/modules/environment/site.tf`) for every environment: `<issue>.heat-sb.dcg-games.com` per sandbox stack, `heat-dev.dcg-games.com`, `heat.dcg-games.com`. Design: `docs/architecture/overview.md`, "Environments"; decisions 0010 and 0015 as amended by 0018, and 0018. History: Issue-39.

## What it creates

| Resource | Name | Notes |
| --- | --- | --- |
| Bucket | `<prefix>-client` | Private: public access blocked, SSE-S3, no ACLs, no versioning (a build artifact, written again on every push), `force_destroy` so a destroy empties it. The bucket policy admits the CloudFront service principal for this distribution alone |
| Origin access control | `<prefix>-client` | CloudFront signs its reads of the bucket (sigv4, always) |
| Distribution | `<hostname>` | The base's certificate, SNI, TLS 1.2 (2021 policy) at least, HTTP/2 and 3, IPv6, `PriceClass_100`. Default root object `index.html`. Waits for deployment on create and change; on destroy, disables, waits and deletes |
| Default behavior | the bucket | GET, HEAD, OPTIONS; redirect to HTTPS; compression; managed `CachingOptimized` (the origin's `Cache-Control` decides, between one second and a year); managed `SecurityHeadersPolicy`; the function below on the viewer request |
| Ordered behavior, per API path | the HTTP API's default endpoint | `/graphql` today, from the manifest's routes; HTTPS only, since a redirect would turn a POST into a GET; every method; managed `CachingDisabled` and `AllViewerExceptHostHeader`, which forwards every viewer header, cookie and query string but `Host`; the same security headers. The `$default` stage serves from the base of the API's URL, so there is no origin path |
| Function | `<prefix>-spa-routes` | `cloudfront-js-2.0`, `spa-routes.js` beside this README: rewrites a path whose last segment has no extension to `/index.html`, so a deep link and a reload serve the page and the router reads the path. Chosen over custom error responses, which apply to every behavior and would turn the API's 404s into the page |
| Records | `<hostname>` A and AAAA | Aliases to the distribution, in the base's zone |

Nothing here costs money at rest: the distribution and the bucket are pay as you go inside the account's always-free allowance, the function inside its two million invocations a month, and the certificate is the base's (decision 0018).

## What is not here

- **The content.** The apply job syncs what `packages/client` builds into the bucket after `terraform apply` and writes `config.json` beside it from the stack's outputs (`scripts/publish-client.sh`): hashed assets with a one-year immutable lifetime, `index.html`, `favicon.ico` and `config.json` with one minute. No invalidations: a new build is a new set of hashed names, and the page is re-read within the minute. Terraform does not write `config.json` because the plan role may not read objects outside the state prefix (`DenyObjectsExceptThisAccountsState`), and refreshing an `aws_s3_object` needs to; the values are still Terraform's outputs.
- **The WebSocket behavior** for the live channel's path, with the `Sec-WebSocket-*` headers forwarded: build order step 4 (decision 0018).
- **A `Content-Security-Policy`.** A custom response headers policy, written when sign-in exists and the origins it must name are known (Issue-46).
- **API Gateway's own endpoint** stays enabled, because the distribution reaches the API there.

## What the environment module supplies

`name_prefix`, `hostname`, `zone_id` and `certificate_arn` from the base, `api_host` from its own HTTP API, `api_paths` from the manifest's routes, `price_class` from the root. The module builds no ARN from an account id.

## Facts checked

All read on 2026-10-17.

- **Managed policies** (CloudFront developer guide, "Use managed cache policies", "Use managed origin request policies", "Use managed response headers policies"): `CachingOptimized` has a minimum TTL of one second, a default of a day and a maximum of a year, and "will cache content for at least the duration specified in the cache policy's minimum TTL, even if the `Cache-Control: no-cache`, `no-store`, or `private` directives are present"; `CachingDisabled` has every TTL at zero; `SecurityHeadersPolicy` sets `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security: max-age=31536000`, `X-Content-Type-Options: nosniff` (overriding the origin), `X-Frame-Options: SAMEORIGIN` and `X-XSS-Protection: 1; mode=block`; `AllViewerExceptHostHeader` is in decision 0018's facts.
- **The provider's distribution resource** (its documentation): `wait_for_deployment`, default true, "will wait for the distribution status to change from `InProgress` to `Deployed`"; `retain_on_delete`, default false, "Disables the distribution instead of deleting it when destroying the resource", after which "the distribution needs to be deleted manually"; `price_class` is one of `PriceClass_All`, `PriceClass_200`, `PriceClass_100`; the certificate "must be in US-EAST-1"; a `function_association` allows one function per event type, `viewer-request` or `viewer-response`.
- **The bucket policy for origin access control** (CloudFront developer guide, "Restrict access to an Amazon S3 origin"): the service principal `cloudfront.amazonaws.com` with `s3:GetObject`, conditioned on `AWS:SourceArn` being the distribution's ARN.
