# A user pool's custom domain for managed login: auth.<zone name>, the
# pool's OAuth endpoints and sign-in pages under the game's own domain, in
# every environment alike (auth.heat-sb.dcg-games.com, auth.heat-dev.dcg-
# games.com, auth.heat.dcg-games.com; decided 2026-10-17, Issue-46). Cognito
# runs a CloudFront distribution for it, secured with the base's certificate,
# which already covers the name; the one record HEAT writes is the alias to
# that distribution. Same price as Cognito's own prefix domain; what it buys
# is a sign-in host whose root matches the application's, "especially when
# the root domain matches the domain that hosts your application" (the
# Cognito guide, read 2026-10-17), and a name that does not depend on a
# region-wide prefix being free, which `heat` is not.
#
# Why a module of its own and not part of the base: Cognito refuses a
# custom domain whose parent has no A record, and in dev and prod the parent
# is the environment's hostname, whose record the site module writes. The
# domain must therefore be created after the environment module, which
# itself needs the base's outputs; inside the base that would be a cycle.
# The root composes this module last, with depends_on where the parent
# record is another module's. The sandbox base writes a placeholder parent
# record itself, since nothing is served at its zone apex.
#
# Managed login version 2 is the branding version the Essentials tier
# carries (decision 0022); every app client on this domain needs a managed
# login branding style, which the environment module creates with each
# client. The minimum TLS version is the service's default: the provider at
# 6.69.1 has no argument for it, and managed login refuses anything below
# TLS_V1_2_2021 in any case.
resource "aws_cognito_user_pool_domain" "this" {
  domain                = local.host
  user_pool_id          = var.user_pool_id
  certificate_arn       = var.certificate_arn
  managed_login_version = 2
}

# The alias to the distribution Cognito created. One A record, as the guide
# has it; the distribution is Cognito's and is not in this account's list.
resource "aws_route53_record" "this" {
  zone_id = var.zone_id
  name    = local.host
  type    = "A"

  alias {
    name                   = aws_cognito_user_pool_domain.this.cloudfront_distribution
    zone_id                = aws_cognito_user_pool_domain.this.cloudfront_distribution_zone_id
    evaluate_target_health = false
  }
}

locals {
  host = "auth.${var.zone_name}"
}
