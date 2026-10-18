# Google, the pool's one identity provider, registered once per pool
# (decision 0018 as amended by Issue-44). The browser app clients that name
# it are each stack's own (terraform/modules/environment, Issue-46's second
# pull request); the managed login domain they send the browser to is
# terraform/modules/login-domain, composed by the root after this module; the
# ci client in user_pool.tf uses neither.
#
# Cognito is a confidential client to Google, so the client secret is part
# of the provider's configuration and sits in this root's state, which
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

    # Cognito fills these six in for a Google provider and returns them on
    # every read; left out of the configuration they show as a change on
    # every plan after the first apply (seen 2026-10-18). Written here as
    # Cognito set them, so that the plan is clean and a change by Google or
    # Cognito would show.
    attributes_url                = "https://people.googleapis.com/v1/people/me?personFields="
    attributes_url_add_attributes = "true"
    authorize_url                 = "https://accounts.google.com/o/oauth2/v2/auth"
    oidc_issuer                   = "https://accounts.google.com"
    token_request_method          = "POST"
    token_url                     = "https://www.googleapis.com/oauth2/v4/token"
  }

  attribute_mapping = {
    username       = "sub"
    email          = "email"
    email_verified = "email_verified"
  }
}
