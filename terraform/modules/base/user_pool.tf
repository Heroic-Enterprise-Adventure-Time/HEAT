# The account's one user pool, shared by every stack in the account: each
# stack adds its own browser app client to it (decision 0018), and Google is
# registered in it once (sign_in.tf, Issue-46); its managed login domain,
# auth.<zone name>, is terraform/modules/login-domain, which the root
# composes after this module. The shape is decision 0022.
#
# What is deliberately not here: any user, because test users are data the
# apply job creates with the CLI (decision 0020), and players create
# themselves through Google sign-in; and any browser app client, which is
# each stack's own.
resource "aws_cognito_user_pool" "this" {
  name = "${var.name_prefix}-users"

  # Essentials: the tier that carries managed login and the current sign-in
  # features, free for the first 10,000 monthly active users (decision 0022).
  user_pool_tier = "ESSENTIALS"

  # Two locks against losing players' records: Cognito's own deletion
  # protection, which makes a delete fail at the API, and Terraform's.
  deletion_protection = "ACTIVE"

  lifecycle {
    prevent_destroy = true
  }

  # Email is the username, and is matched without regard to case, so
  # Player@example.com and player@example.com are one account. This cannot
  # be changed after creation.
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  username_configuration {
    case_sensitive = false
  }

  # Email is required on every user. Declared explicitly so that it is: the
  # standard attribute exists regardless, but is optional until a schema
  # block says otherwise. Changing this block replaces the pool, which is
  # why it is settled before the first player exists. The constraints are
  # Cognito's own defaults for the attribute, written out so that the
  # provider does not see a difference on every plan.
  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = "0"
      max_length = "2048"
    }
  }

  # Nobody signs up with a password form: players arrive through Google
  # (Issue-46) and test users are created by the apply job. A password user
  # therefore only exists because an administrator created one.
  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  # No MFA: the players who hold a password are test users, and Google
  # brings its own second factor.
  mfa_configuration = "OFF"

  # Recovery is an administrator's action, never a code sent to an address
  # or a phone: test users have no inbox, and players recover through Google.
  account_recovery_setting {
    recovery_mechanism {
      name     = "admin_only"
      priority = 1
    }
  }

  # No password_policy block: Cognito's default applies, what the console
  # calls "Cognito defaults" (at least eight characters with mixed character
  # classes; a temporary password lasts seven days, the API's default). The
  # plan shows the block as known after apply; the first apply's state
  # records the values. The test password the owner sets must meet it.
}

# The password-flow client the end-to-end tests sign in with (decision
# 0018). A public client, since a test runner cannot keep a secret: no
# OAuth, no callback, no hosted page, just InitiateAuth with USER_PASSWORD_AUTH
# and the refresh flow. Tokens are short and the refresh token lives a day,
# which outlasts any test run and nothing else; a revoked refresh token is
# refused at once; and a wrong password and an unknown user produce the same
# error, so the client cannot be used to enumerate users. Browser clients,
# with the code grant and PKCE, are each stack's own (Issue-46).
#
# Only where the pool holds test users: the sandbox and dev. Prod's pool has
# no password-flow client, because every one of its users arrives through
# Google and nothing in prod should accept a password (Issue-41); its smoke
# test stops at the authorizer's refusal. The moved block keeps the existing
# clients where they are when the resource gained its count.
resource "aws_cognito_user_pool_client" "ci" {
  count = var.ci_client ? 1 : 0

  name         = "ci"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  supported_identity_providers = ["COGNITO"]

  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 1

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true
}

moved {
  from = aws_cognito_user_pool_client.ci
  to   = aws_cognito_user_pool_client.ci[0]
}
