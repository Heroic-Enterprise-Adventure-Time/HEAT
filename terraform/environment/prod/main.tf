# The prod environment: the base and the environment in one root and one
# apply (decision 0016 as confirmed on 2026-10-17), with prod's values as
# literals, the same three modules in the same order as the dev root. What
# differs from dev is written here and nowhere else: the zone is the game's
# own, heat.dcg-games.com; the pool has no ci client, so no password is
# accepted anywhere in prod and the authorizer has one audience, the browser
# client; and nothing is minted or created in the pool by the apply job,
# since prod has no test users (decision 0020, Issue-41).
#
# Three modules, in dependency order: the base (the zone, the certificate,
# the pool with Google), the environment on top of it (the tables, the
# function, the API, the site at the zone apex, the browser client, the
# alarms), and the pool's managed login domain last, because Cognito checks
# that the domain's parent, heat.dcg-games.com, has an A record, and that
# record is the site's alias, written by the environment module
# (terraform/modules/login-domain).

locals {
  zone_name = "heat.dcg-games.com"
}

module "base" {
  source = "../../modules/base"

  name_prefix = "${local.name_prefix}-base"
  zone_name   = local.zone_name

  # No password-flow client: prod's users are players, every one of them
  # through Google.
  ci_client = false

  # The pool's Google OAuth client, registered by the owner against
  # auth.heat.dcg-games.com: this root's only secrets, from the prod GitHub
  # environment (decision 0020).
  google_client_id     = var.google_client_id
  google_client_secret = var.google_client_secret
}

module "environment" {
  source = "../../modules/environment"

  name_prefix = local.name_prefix
  environment = local.environment

  functions = jsondecode(file("${path.module}/../../../manifest.json")).functions
  dist_dir  = "${path.module}/../../../dist"

  user_pool_id = module.base.user_pool_id
  # null: the browser client is the authorizer's only audience, and the
  # parameter app_client_id is not written.
  app_client_id = module.base.ci_client_id

  # The managed login host is a name derived from the zone, as dev's is,
  # because the domain itself is created after this module (above); the
  # login-domain module's output would be a cycle.
  login_host = "https://auth.${local.zone_name}"

  # prod's one hostname is its zone's apex, which the base's certificate
  # carries beside the wildcard (decision 0018 as amended by Issue-39).
  hostname        = local.zone_name
  zone_id         = module.base.zone_id
  certificate_arn = module.base.certificate_arn
  price_class     = "PriceClass_100"

  permissions_boundary_arn = "arn:aws:iam::${var.workload_account_id}:policy/heat-prod-boundary"

  # Google only: nothing in prod accepts a password (Issue-41, Issue-86).
  password_sign_in = false

  # The commit this apply deploys (decision 0030).
  app_version = var.app_version

  # No laptop signs in to prod: its records are players'. Display work uses
  # a sandbox stack (docs/process/development.md, rule 5).
  extra_callback_urls = []

  # A permanent environment: a month of logs, recovery and deletion
  # protection on both tables, and the alarms to the owner's address. The
  # throttle is dev's, because heat-prod has the same new-account Lambda
  # concurrency of 10 (read 2026-10-18) and prod is its only stack; it is
  # the kill switch for a runaway caller until the quota is raised.
  log_retention_days     = 30
  point_in_time_recovery = true
  deletion_protection    = true
  throttling_rate_limit  = 10
  throttling_burst_limit = 20
  alarm_email            = var.alarm_email
}

# auth.heat.dcg-games.com, after the apex has its record.
module "login_domain" {
  source = "../../modules/login-domain"

  user_pool_id    = module.base.user_pool_id
  zone_name       = module.base.zone_name
  zone_id         = module.base.zone_id
  certificate_arn = module.base.certificate_arn

  depends_on = [module.environment]
}
