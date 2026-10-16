# What one workload account needs before anything runs in it, parameterised by
# environment. The root under terraform/bootstrap/<environment> supplies these.

variable "environment" {
  description = "The environment name, dev or prod. Names the deploy role, the budget and the functions the role may update."
  type        = string

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be dev or prod."
  }
}

variable "github_environment" {
  description = "The GitHub Actions environment whose jobs may assume the deploy role. Named in the role's trust policy."
  type        = string
}

variable "workload_account_id" {
  description = "The workload AWS account the aws.workload provider is configured for. Used only to build ARNs; the provider itself is the root's."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.workload_account_id))
    error_message = "workload_account_id must be a 12-digit AWS account id."
  }
}

variable "monthly_budget_usd" {
  description = "The monthly cost budget for the workload account, in US dollars. Alerts at 50% and 80% of actual spend and at 100% of forecasted spend."
  type        = number

  validation {
    condition     = var.monthly_budget_usd > 0
    error_message = "monthly_budget_usd must be a positive number."
  }
}

variable "budget_alert_email" {
  description = "The one email address that receives the budget alerts."
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.budget_alert_email))
    error_message = "budget_alert_email must be an email address."
  }
}
