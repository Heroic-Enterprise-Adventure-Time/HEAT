# What one environment's site needs from the environment module: a name,
# the hostname, what the account's base provides (the zone and the
# certificate), where the API is, and the one per-environment literal. The
# account id never reaches this module; nothing here builds an ARN by hand.

variable "name_prefix" {
  description = "The prefix of every named resource: heat-sb<issue> for a sandbox stack, heat-dev and heat-prod for the permanent environments. The bucket is <prefix>-client."
  type        = string

  validation {
    condition     = can(regex("^heat-[a-z0-9-]+$", var.name_prefix))
    error_message = "name_prefix must start with heat- and contain only lower-case letters, digits and hyphens."
  }
}

variable "hostname" {
  description = "The environment's one hostname, which the distribution answers to: <issue>.heat-sb.dcg-games.com, heat-dev.dcg-games.com or heat.dcg-games.com (decisions 0015 and 0018). Inside the zone, and covered by the certificate."
  type        = string

  validation {
    condition     = can(regex("^([a-z0-9-]+\\.)+dcg-games\\.com$", var.hostname))
    error_message = "hostname must be a name under dcg-games.com, without a trailing dot."
  }
}

variable "zone_id" {
  description = "The account's hosted zone (terraform/modules/base), where the hostname's records are written."
  type        = string
}

variable "certificate_arn" {
  description = "The account's certificate for the zone name and its wildcard, in us-east-1 (terraform/modules/base), which covers the hostname."
  type        = string
}

variable "api_host" {
  description = "The HTTP API's default endpoint host, <api id>.execute-api.<region>.amazonaws.com, without a scheme: the origin the API paths are sent to. The $default stage serves from the base of that URL, so there is no origin path (decision 0018)."
  type        = string
}

variable "api_paths" {
  description = "The paths the API serves, each an exact path pattern sent to the API origin with caching disabled: today [\"/graphql\"], from the manifest's routes. The live channel's path joins them in build order step 4."
  type        = list(string)

  validation {
    condition     = length(var.api_paths) > 0 && alltrue([for p in var.api_paths : startswith(p, "/")])
    error_message = "api_paths must hold at least one path, each starting with /."
  }
}

variable "price_class" {
  description = "The distribution's price class: PriceClass_100 (North America and Europe) in every environment today, as a literal of the root (decision 0018, settled in Issue-39)."
  type        = string

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.price_class)
    error_message = "price_class must be PriceClass_100, PriceClass_200 or PriceClass_All."
  }
}
