# The sandbox base: what every per-issue stack in heat-sandbox shares, in one
# permanent root applied from main (decision 0018). One module call with the
# sandbox's values as literals (decision 0016); the dev and prod roots will
# compose the same module beside the environment module.
module "base" {
  source = "../../modules/base"

  name_prefix = "heat-sb-base"
  zone_name   = "heat-sb.dcg-games.com"

  # The pool's Google OAuth client (Issue-46): the two values are this root's
  # only secrets, from the sandbox-base GitHub environment (decision 0020).
  google_client_id     = var.google_client_id
  google_client_secret = var.google_client_secret
}

# Cognito refuses a custom domain whose parent has no A record ("This record
# must resolve to something, but the value of the record doesn't matter to
# Amazon Cognito"; the guide, read 2026-10-17), and nothing is served at this
# zone's apex: the sandbox's hostnames are its stacks'. So the apex carries
# the guide's own example value, an address in the TEST-NET-2 range that
# routes nowhere, for the check and nothing else. In dev and prod the apex is
# the environment's site, and this record does not exist.
resource "aws_route53_record" "apex_placeholder" {
  zone_id = module.base.zone_id
  name    = module.base.zone_name
  type    = "A"
  ttl     = 300
  records = ["198.51.100.1"]
}

# auth.heat-sb.dcg-games.com, the pool's managed login domain, after the
# parent record exists (terraform/modules/login-domain).
module "login_domain" {
  source = "../../modules/login-domain"

  user_pool_id    = module.base.user_pool_id
  zone_name       = module.base.zone_name
  zone_id         = module.base.zone_id
  certificate_arn = module.base.certificate_arn

  depends_on = [aws_route53_record.apex_placeholder]
}
