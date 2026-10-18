# The stack's browser app client in the account's shared pool, and its
# managed login style: how a player signs in to this stack (decision 0018:
# a pool per account, an app client per stack; the shape is decision 0024).
#
# A public client, since a browser cannot keep a secret, with the one grant
# the Cognito guide recommends for public clients: the authorization code
# grant, which the client completes with PKCE (the browser's code is in
# packages/client). Google is its only provider, so managed login has no
# password form to show; the client sends the browser straight to Google
# with identity_provider=Google. The callback and sign-out URLs are the
# stack's hostname and the Angular dev server, which is how display work
# on a laptop signs in to a real stack (decision 0018).
#
# Tokens: access and ID tokens of one hour, Cognito's default and the ci
# client's; a refresh token of 30 days, Cognito's default, with refresh
# token rotation, "a security best practice" per the guide (read
# 2026-10-17): every refresh returns a new refresh token and revokes the
# old one after a grace period, here ten seconds, the guide's example,
# enough for a second browser tab that refreshed at the same moment. The
# rotation stays inside the original 30 days; a player signs in again a
# month after the first sign-in. Rotation is incompatible with the
# REFRESH_TOKEN_AUTH flow, so the explicit flows list it out: this client's
# only sign-in is the code grant through managed login, and USER_SRP_AUTH,
# which the API requires at least one flow to be named for, is the one that
# reveals nothing a browser cannot already do. Token revocation on, as on
# the ci client. Read attributes: what the ID token and userInfo may carry,
# the three the scopes cover.
resource "aws_cognito_user_pool_client" "browser" {
  name         = "${var.name_prefix}-browser"
  user_pool_id = var.user_pool_id

  generate_secret = false

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["Google"]

  callback_urls = [
    "https://${var.hostname}",
    "http://localhost:4200",
  ]
  logout_urls = [
    "https://${var.hostname}",
    "http://localhost:4200",
  ]

  explicit_auth_flows = ["ALLOW_USER_SRP_AUTH"]

  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  refresh_token_rotation {
    feature                    = "ENABLED"
    retry_grace_period_seconds = 10
  }

  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  read_attributes = ["email", "email_verified", "name", "picture", "sub"]
}

# Every app client on a managed login domain needs a branding style, or the
# login page has nothing to render; a client created through the API gets
# none until one is created (decision 0022's facts). Cognito's provided
# values: the default style, which the branding editor can change later.
# The style belongs to the client and goes with the stack.
resource "aws_cognito_managed_login_branding" "browser" {
  user_pool_id                = var.user_pool_id
  client_id                   = aws_cognito_user_pool_client.browser.id
  use_cognito_provided_values = true
}
