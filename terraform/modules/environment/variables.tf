# What one environment needs from its root: a name, the environment's
# per-environment literals (decision 0016), the functions from manifest.json,
# and what the account's base provides. The root under
# terraform/environment/<name> supplies these; the account id reaches this
# module only inside the boundary ARN.

variable "name_prefix" {
  description = "The prefix of every named resource: heat-sb<issue> for a sandbox stack, heat-dev and heat-prod for the permanent environments. Inside the account's resource prefix that the bootstrap boundary allows."
  type        = string

  validation {
    condition     = can(regex("^heat-[a-z0-9-]+$", var.name_prefix))
    error_message = "name_prefix must start with heat- and contain only lower-case letters, digits and hyphens."
  }
}

variable "environment" {
  description = "The environment this stack belongs to: sandbox, dev or prod. Tags and the parameter path."
  type        = string

  validation {
    condition     = contains(["sandbox", "dev", "prod"], var.environment)
    error_message = "environment must be sandbox, dev or prod."
  }
}

variable "functions" {
  description = "The functions of manifest.json, keyed by name: the exported handler, memory, timeout and HTTP routes. The root passes jsondecode(file(manifest.json)).functions; nothing declares a function or route anywhere else (docs/standards/typescript.md, rule 4)."
  type = map(object({
    export         = string
    memoryMb       = number
    timeoutSeconds = number
    http = list(object({
      method = string
      path   = string
    }))
  }))
}

variable "dist_dir" {
  description = "The directory scripts/bundle.mjs writes to, holding one subdirectory per function with its index.mjs. The module zips each subdirectory."
  type        = string
}

variable "user_pool_id" {
  description = "The account's shared user pool (terraform/modules/base): the token issuer the JWT authorizer verifies against."
  type        = string
}

variable "app_client_id" {
  description = "The base's ci app client, the password-flow client the end-to-end tests sign in with: an audience the JWT authorizer accepts beside the stack's own browser client (sign_in.tf), and the parameter app_client_id. null where the base has no ci client (prod, Issue-41): the browser client is then the only audience and the parameter is not written."
  type        = string
  nullable    = true
}

variable "login_host" {
  description = "The pool's managed login host, https://auth.<zone name> (terraform/modules/login-domain): where the browser client sends a player to sign in, and what config.json carries to the client."
  type        = string

  validation {
    condition     = can(regex("^https://auth\\.([a-z0-9-]+\\.)+dcg-games\\.com$", var.login_host))
    error_message = "login_host must be https://auth.<zone name> under dcg-games.com."
  }
}

variable "extra_callback_urls" {
  description = "Callback and sign-out URLs of the browser client beside https://<hostname>: [\"http://localhost:4200\"] for a sandbox stack, so that the Angular dev server on a laptop signs in to a real stack (decision 0018); none for dev and prod, whose records are players' and are never reached from a laptop."
  type        = list(string)

  validation {
    condition     = alltrue([for u in var.extra_callback_urls : can(regex("^https?://", u))])
    error_message = "every extra callback URL must start with http:// or https://."
  }
}

variable "password_sign_in" {
  description = "Whether the browser client also offers the pool's own email and password sign-in beside Google (Issue-86): true in a sandbox stack, so that the test users of the base can sign in from the agent's session browser without Google; false in dev and prod, where every player arrives through Google. The pool keeps administrator-only creation and recovery either way (decision 0022), so the form is a sign-in form and nothing else."
  type        = bool
}

variable "alarm_email" {
  description = "Where the environment's alarms notify (alarms.tf): an SNS topic with this address subscribed, one email per alarm state change. null, and no topic or alarm is created: a sandbox stack lives as long as its branch and nobody is on call for it. dev and prod pass the address from their GitHub environment's variable HEAT_ALARM_EMAIL, never from a committed file (decision 0016)."
  type        = string
  nullable    = true

  validation {
    condition     = var.alarm_email == null || can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.alarm_email))
    error_message = "alarm_email must be null or an email address."
  }
}

variable "permissions_boundary_arn" {
  description = "The bootstrap boundary of this account, which every role this module creates must carry (decision 0019)."
  type        = string
}

variable "log_retention_days" {
  description = "Retention of every log group this module creates: the functions' and the API's access log."
  type        = number
}

variable "point_in_time_recovery" {
  description = "Point-in-time recovery on both tables: off in a sandbox stack, on in dev and prod."
  type        = bool
}

variable "deletion_protection" {
  description = "Deletion protection on both tables: off in a sandbox stack, which its branch's deletion destroys, on in dev and prod."
  type        = bool
}

variable "throttling_rate_limit" {
  description = "The HTTP API's steady-state request rate per second, across every route. With the account's Lambda concurrency it is the environment's kill switch for a runaway caller."
  type        = number
}

variable "throttling_burst_limit" {
  description = "The HTTP API's burst above the rate limit."
  type        = number
}

variable "log_level" {
  description = "POWERTOOLS_LOG_LEVEL for every function."
  type        = string
  default     = "INFO"
}

variable "hostname" {
  description = "The environment's one hostname, a CloudFront distribution in front of the client bucket and the HTTP API: <issue>.heat-sb.dcg-games.com for a sandbox stack, heat-dev.dcg-games.com, heat.dcg-games.com (decisions 0015 and 0018). Under the base's zone and covered by its certificate."
  type        = string
}

variable "zone_id" {
  description = "The account's hosted zone (terraform/modules/base), where the hostname's records are written."
  type        = string
}

variable "certificate_arn" {
  description = "The account's certificate for the zone name and its wildcard, in us-east-1 (terraform/modules/base), which the distribution serves."
  type        = string
}

variable "price_class" {
  description = "The distribution's price class: PriceClass_100 in every environment today."
  type        = string
}
