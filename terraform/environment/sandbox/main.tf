# A per-issue sandbox stack: the environment module with the sandbox's
# literals (decision 0016), on top of the base that every stack in this
# account shares (terraform/environment/sandbox-base). The base is read by
# name through data sources, not through its state, so this root depends
# on what exists in the account and not on how the base's state is laid out.

data "aws_cognito_user_pools" "base" {
  name = "heat-sb-base-users"
}

data "aws_cognito_user_pool_clients" "base" {
  user_pool_id = one(data.aws_cognito_user_pools.base.ids)
}

# The zone and the certificate the base created (Issue-37 and Issue-39),
# found by their names as the pool is. The certificate is the issued one for
# the zone name, which carries the wildcard that covers this stack's hostname.
data "aws_route53_zone" "base" {
  name         = local.zone_name
  private_zone = false
}

data "aws_acm_certificate" "base" {
  domain      = local.zone_name
  statuses    = ["ISSUED"]
  most_recent = true
}

locals {
  zone_name = "heat-sb.dcg-games.com"

  # The ci client is the password-flow client the end-to-end tests and the
  # agent sign in with (decision 0018); the lists are aligned by index.
  ci_client_id = data.aws_cognito_user_pool_clients.base.client_ids[
    index(data.aws_cognito_user_pool_clients.base.client_names, "ci")
  ]
}

module "environment" {
  source = "../../modules/environment"

  name_prefix = local.name_prefix
  environment = local.environment

  functions = jsondecode(file("${path.module}/../../../manifest.json")).functions
  dist_dir  = "${path.module}/../../../dist"

  user_pool_id  = one(data.aws_cognito_user_pools.base.ids)
  app_client_id = local.ci_client_id

  # The pool's managed login host (terraform/environment/sandbox-base), a
  # name derived from the zone like the hostname below, so the root reads
  # nothing from the base's state for it.
  login_host = "https://auth.${local.zone_name}"

  # The stack's hostname, <issue>.heat-sb.dcg-games.com, on the base's zone
  # and certificate (decision 0018). PriceClass_100, North America and
  # Europe, where the viewers are; the same in every environment today.
  hostname        = "${var.issue}.${local.zone_name}"
  zone_id         = data.aws_route53_zone.base.zone_id
  certificate_arn = data.aws_acm_certificate.base.arn
  price_class     = "PriceClass_100"

  permissions_boundary_arn = "arn:aws:iam::${var.workload_account_id}:policy/heat-sandbox-boundary"

  # The test users of the base sign in with email and password beside
  # Google, so that the agent's session browser signs in without Google
  # (Issue-86, decision 0024 as amended).
  password_sign_in = true

  # The Angular dev server on a laptop signs in to this stack through its
  # browser client (decision 0018, docs/process/development.md rule 5).
  extra_callback_urls = ["http://localhost:4200"]

  # A sandbox stack lives as long as its branch: short retention, no
  # recovery, no deletion protection, no alarms. The throttle, with the
  # account's Lambda concurrency of 10 shared by every stack, is the kill
  # switch.
  log_retention_days     = 7
  point_in_time_recovery = false
  deletion_protection    = false
  throttling_rate_limit  = 10
  throttling_burst_limit = 20
  alarm_email            = null
}
