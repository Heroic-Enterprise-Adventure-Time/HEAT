# The three values this root never commits: two AWS account ids and the alert
# address. They live in terraform.tfvars beside this file (ignored by git; see
# terraform.tfvars.example), which Terraform loads on every run, or in the
# environment as TF_VAR_platform_account_id, TF_VAR_workload_account_id and
# TF_VAR_budget_alert_email. Everything else about dev is a literal in main.tf.
#
# Every environment root declares these same three, because Terraform lets a
# root's values land only in the root's own variables. The validation is not
# repeated: the module validates what it receives, and only the platform id,
# which the module never sees, is checked here.

variable "platform_account_id" {
  description = "The heat-platform AWS account, where this stack runs and keeps its state. The default provider refuses credentials for any other account."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.platform_account_id))
    error_message = "platform_account_id must be a 12-digit AWS account id."
  }
}

variable "workload_account_id" {
  description = "The heat-dev AWS account, reached by assuming PlatformAdminRole there. Validated by the module."
  type        = string
}

variable "budget_alert_email" {
  description = "The one email address that receives the budget alerts. Validated by the module."
  type        = string
  sensitive   = true
}
