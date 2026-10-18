# How a browser signs in to the pool: the pool's domain, which hosts the
# managed login pages and the OAuth endpoints, and Google as the pool's one
# identity provider, registered once per pool (decision 0018 as amended by
# Issue-44). The browser app clients that use them are each stack's own
# (terraform/modules/environment, Issue-46's second pull request); the ci
# client in user_pool.tf never touches this domain.

data "aws_region" "current" {}

# The prefix domain, <prefix>.auth.<region>.amazoncognito.com: Cognito's own
# hostname, which costs nothing and needs no certificate or record. A prefix
# is unique across every account in the region, so a taken prefix fails this
# resource at apply with nothing else created; the owner's Google client is
# registered against this hostname, so a change of prefix is a change there
# too. Managed login version 2 is the branding version the Essentials tier
# carries (decision 0022); every app client on this domain needs a managed
# login branding style, which the environment module creates with each
# client. A custom domain on heat-sb.dcg-games.com was not chosen: it needs
# a certificate and an A record of its own per pool, and the Cognito guide
# says the prefix domain "has little visible effect" for third-party
# redirects, which is the only sign-in this pool offers (read 2026-10-17).
resource "aws_cognito_user_pool_domain" "this" {
  domain                = var.domain_prefix
  user_pool_id          = aws_cognito_user_pool.this.id
  managed_login_version = 2
}

# Google. Cognito is a confidential client to Google, so the client secret is
# part of the provider's configuration and sits in this root's state, which
# decision 0020 accepts: the same identities could read it back from Cognito
# in any case, and the provider has no write-only argument for it yet
# (upstream issue 48319). The two values reach the root as sensitive
# variables, which keeps them out of every plan the workflow writes.
#
# The scopes and the mapping are the Cognito guide's: "profile email openid",
# and at least email and email_verified, "If you don't map email_verified,
# Amazon Cognito treats the email as unverified" (read 2026-10-17). Google
# asserts email_verified for Gmail and Workspace accounts, which is what
# makes the pool's email-as-username rule (decision 0022) hold for players.
# The username is Google's subject, a stable id that never changes when the
# address does.
resource "aws_cognito_identity_provider" "google" {
  user_pool_id  = aws_cognito_user_pool.this.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
    authorize_scopes = "openid email profile"
  }

  attribute_mapping = {
    username       = "sub"
    email          = "email"
    email_verified = "email_verified"
  }
}
