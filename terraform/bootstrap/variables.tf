# The two values this repository never commits: AWS account ids. They are
# given at plan time through terraform.tfvars (ignored by git; see
# terraform.tfvars.example) or the environment variables
# TF_VAR_platform_account_id and TF_VAR_workload_account_id.

variable "platform_account_id" {
  description = "The heat-platform AWS account, where this stack runs and keeps its state. The default provider refuses credentials for any other account."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.platform_account_id))
    error_message = "platform_account_id must be a 12-digit AWS account id."
  }
}

variable "workload_account_id" {
  description = "The workload AWS account this apply targets, heat-dev or heat-prod, reached by assuming PlatformAdminRole there."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.workload_account_id))
    error_message = "workload_account_id must be a 12-digit AWS account id."
  }
}

# The third value that stays out of git, beside the ids in terraform.tfvars or
# as TF_VAR_budget_alert_email: where budget alerts go.
variable "budget_alert_email" {
  description = "The one email address that receives the budget alerts."
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.budget_alert_email))
    error_message = "budget_alert_email must be an email address."
  }
}

# The committed per-environment values, one file per environment (dev.tfvars).

variable "monthly_budget_usd" {
  description = "The monthly cost budget for the workload account, in US dollars. Alerts at 50% and 80% of actual spend and at 100% of forecasted spend."
  type        = number

  validation {
    condition     = var.monthly_budget_usd > 0
    error_message = "monthly_budget_usd must be a positive number."
  }
}

variable "environment" {
  description = "The environment name, dev or prod. Names the deploy role and the functions it may update, and is the Environment tag."
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
