# The dev environment: the base and the environment in one root and one
# apply (decision 0016 as confirmed on 2026-10-17), with dev's values as
# literals. The sandbox account splits the same two modules into two roots
# because many stacks share one base; dev has one stack, so there is nothing
# to share and nothing to find by name.
#
# Three modules, in dependency order: the base (the zone, the certificate,
# the pool with Google and the ci client), the environment on top of it (the
# tables, the function, the API, the site at the zone apex, the browser
# client, the alarms), and the pool's managed login domain last, because
# Cognito checks that the domain's parent, heat-dev.dcg-games.com, has an A
# record, and that record is the site's alias, written by the environment
# module (terraform/modules/login-domain). The sandbox base has a placeholder
# apex record instead; dev's apex is the game.

locals {
  zone_name = "heat-dev.dcg-games.com"
}

module "base" {
  source = "../../modules/base"

  name_prefix = "${local.name_prefix}-base"
  zone_name   = local.zone_name

  # The pool's Google OAuth client, registered by the owner against
  # auth.heat-dev.dcg-games.com: this root's only secrets, from the dev
  # GitHub environment (decision 0020).
  google_client_id     = var.google_client_id
  google_client_secret = var.google_client_secret
}

module "environment" {
  source = "../../modules/environment"

  name_prefix = local.name_prefix
  environment = local.environment

  functions = jsondecode(file("${path.module}/../../../manifest.json")).functions
  dist_dir  = "${path.module}/../../../dist"

  user_pool_id  = module.base.user_pool_id
  app_client_id = module.base.ci_client_id

  # The managed login host is a name derived from the zone, as the sandbox
  # stacks derive it, because the domain itself is created after this module
  # (above); the login-domain module's output would be a cycle.
  login_host = "https://auth.${local.zone_name}"

  # dev's one hostname is its zone's apex, which the base's certificate
  # carries beside the wildcard (decision 0018 as amended by Issue-39).
  hostname        = local.zone_name
  zone_id         = module.base.zone_id
  certificate_arn = module.base.certificate_arn
  price_class     = "PriceClass_100"

  permissions_boundary_arn = "arn:aws:iam::${var.workload_account_id}:policy/heat-dev-boundary"

  # No laptop signs in to dev: its records are players'. Display work uses a
  # sandbox stack (docs/process/development.md, rule 5).
  extra_callback_urls = []

  # A permanent environment: a month of logs, recovery and deletion
  # protection on both tables, and the alarms to the owner's address. The
  # throttle is the sandbox's, because heat-dev has the same new-account
  # Lambda concurrency of 10 (read 2026-10-18) and dev is its only stack.
  log_retention_days     = 30
  point_in_time_recovery = true
  deletion_protection    = true
  throttling_rate_limit  = 10
  throttling_burst_limit = 20
  alarm_email            = var.alarm_email
}

# auth.heat-dev.dcg-games.com, after the apex has its record.
module "login_domain" {
  source = "../../modules/login-domain"

  user_pool_id    = module.base.user_pool_id
  zone_name       = module.base.zone_name
  zone_id         = module.base.zone_id
  certificate_arn = module.base.certificate_arn

  depends_on = [module.environment]
}
