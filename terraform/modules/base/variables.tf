# What an account's base needs from its root. The root under
# terraform/environment/<name> supplies these as literals (decision 0016);
# the account id never reaches this module, because nothing here builds an
# ARN by hand.

variable "name_prefix" {
  description = "The prefix of every named resource the base creates: heat-sb-base in the sandbox account, heat-dev-base and heat-prod-base in the permanent ones. Inside the account's resource prefix that the bootstrap boundary allows."
  type        = string

  validation {
    condition     = can(regex("^heat-[a-z0-9-]+$", var.name_prefix))
    error_message = "name_prefix must start with heat- and contain only lower-case letters, digits and hyphens."
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
