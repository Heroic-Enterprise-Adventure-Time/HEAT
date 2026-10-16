# What one workload account needs before the pipeline can run in it,
# parameterised by environment. The root under terraform/bootstrap/<environment>
# supplies these.

variable "environment" {
  description = "The environment name: sandbox, dev or prod. Names the roles, the policies, the budget and the state key prefix, and sets the resource prefix the boundary allows."
  type        = string

  validation {
    condition     = contains(["sandbox", "dev", "prod"], var.environment)
    error_message = "environment must be sandbox, dev or prod."
  }
}

variable "github_environment" {
  description = "The GitHub Actions environment whose jobs may assume the apply role, as a StringLike pattern: dev and prod exactly, sandbox-* for the per-stack environments of the sandbox account."
  type        = string
}

variable "workload_account_id" {
  description = "The workload AWS account the aws.workload provider is configured for. Used to build ARNs; the provider itself is the root's."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.workload_account_id))
    error_message = "workload_account_id must be a 12-digit AWS account id."
  }
}

variable "management_account_id" {
  description = "The organization's management account, whose SecurityAudit role the plan role trusts for the agent."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.management_account_id))
    error_message = "management_account_id must be a 12-digit AWS account id."
  }
}

variable "monthly_budget_usd" {
  description = "The monthly cost budget for the workload account, in US dollars. Alerts at 50% and 80% of actual spend and at 100% of forecasted spend; the freeze action at 100% of actual spend."
  type        = number

  validation {
    condition     = var.monthly_budget_usd > 0
    error_message = "monthly_budget_usd must be a positive number."
  }
}

variable "budget_alert_email" {
  description = "The one email address that receives the budget alerts and the notice that the freeze action ran."
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.budget_alert_email))
    error_message = "budget_alert_email must be an email address."
  }
}
