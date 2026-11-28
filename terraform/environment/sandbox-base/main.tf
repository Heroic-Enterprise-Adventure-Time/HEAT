# The sandbox base: what every per-issue stack in heat-sandbox shares, in one
# permanent root applied from main (decision 0018). Two module calls with
# the sandbox's values as literals (decision 0016); the dev and prod roots
# compose the same two modules around the environment module.
module "base" {
  source = "../../modules/base"

  name_prefix = "heat-sb-base"
  zone_name   = "heat-sb.dcg-games.com"

  # The password-flow client the stack test and the test users sign in with.
  ci_client = true

  # The pool's Google OAuth client (Issue-46): the two values are this root's
  # only secrets, from the sandbox-base GitHub environment (decision 0020).
  google_client_id     = var.google_client_id
  google_client_secret = var.google_client_secret
}

# auth.heat-sb.dcg-games.com, the pool's managed login domain
# (terraform/modules/login-domain).
module "login_domain" {
  source = "../../modules/login-domain"

  user_pool_id    = module.base.user_pool_id
  zone_name       = module.base.zone_name
  zone_id         = module.base.zone_id
  certificate_arn = module.base.certificate_arn

  # Nothing is served at this zone's apex, the sandbox's hostnames being its
  # stacks', so the module writes the parent record Cognito checks. In dev
  # and prod the apex is the site.
  apex_placeholder = true
}

# The placeholder record was this root's own resource until Issue-270 moved
# it into the module that needs it (terraform.md, rule 1). The block moves
# the state to the new address at the first apply, and stays as history
# afterwards (rule 11).
moved {
  from = aws_route53_record.apex_placeholder
  to   = module.login_domain.aws_route53_record.apex_placeholder[0]
}
