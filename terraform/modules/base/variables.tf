# What an account's base needs from its root. The root under
# terraform/environment/<name> supplies these as literals (decision 0016);
# the account id never reaches this module, because nothing here builds an
# ARN by hand.

variable "ci_client" {
  description = "Whether the pool gets the ci app client, the password flow the stack test and the test users sign in with (user_pool.tf). true in the sandbox and dev, whose pools hold test users; false in prod, whose pool holds players only and no password at all (Issue-41)."
  type        = bool
}

variable "name_prefix" {
  description = "The prefix of every named resource the base creates: heat-sb-base in the sandbox account, heat-dev-base and heat-prod-base in the permanent ones. Inside the account's resource prefix that the bootstrap boundary allows."
  type        = string

  validation {
    condition     = can(regex("^heat-[a-z0-9-]+$", var.name_prefix))
    error_message = "name_prefix must start with heat- and contain only lower-case letters, digits and hyphens."
  }
}

variable "google_client_id" {
  description = "The client id of the Google OAuth client registered for this pool's domain. From the root's GitHub environment variable HEAT_GOOGLE_CLIENT_ID, one name in every environment (decision 0020); not secret, but per environment."
  type        = string

  validation {
    condition     = length(var.google_client_id) > 0
    error_message = "google_client_id is empty: the environment this root runs under has no HEAT_GOOGLE_CLIENT_ID variable, or TF_VAR_google_client_id is not set for a local plan."
  }
}

variable "google_client_secret" {
  description = "The client secret of that Google OAuth client. From the root's GitHub environment secret HEAT_GOOGLE_CLIENT_SECRET (decision 0020). Sensitive: shown as such in every plan, and held in this root's state."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.google_client_secret) > 0
    error_message = "google_client_secret is empty: the environment this root runs under has no HEAT_GOOGLE_CLIENT_SECRET secret, or TF_VAR_google_client_secret is not set for a local plan."
  }
}

variable "zone_name" {
  description = "The hosted zone the base creates and the organization layer delegates to this account: heat-sb.dcg-games.com, heat-dev.dcg-games.com or heat.dcg-games.com (decisions 0015 and 0018). Without a trailing dot."
  type        = string

  validation {
    condition     = can(regex("^([a-z0-9-]+\\.)+dcg-games\\.com$", var.zone_name))
    error_message = "zone_name must be a subdomain of dcg-games.com, without a trailing dot."
  }
}
