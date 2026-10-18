# What a login domain needs from its root: the pool it serves and the zone,
# name and certificate of the base, all four from the base module's outputs.

variable "user_pool_id" {
  description = "The account's shared user pool (terraform/modules/base), whose managed login this domain hosts."
  type        = string
}

variable "zone_name" {
  description = "The account's zone name, without a trailing dot: the domain is auth.<zone name>, and the zone apex is the parent whose A record Cognito checks."
  type        = string

  validation {
    condition     = can(regex("^([a-z0-9-]+\\.)+dcg-games\\.com$", var.zone_name))
    error_message = "zone_name must be a subdomain of dcg-games.com, without a trailing dot."
  }
}

variable "zone_id" {
  description = "The account's hosted zone, where the alias record is written."
  type        = string
}

variable "certificate_arn" {
  description = "The base's certificate in us-east-1, which covers auth.<zone name> through its wildcard; Cognito's distribution serves it."
  type        = string
}
