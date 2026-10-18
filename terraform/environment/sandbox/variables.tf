# Two values, both from the workflow or scripts/sandbox.mjs, never from a
# committed file: the sandbox account's id (docs/README.md, rule 9) and the
# issue number from the branch name, which names the stack.

variable "workload_account_id" {
  description = "The heat-sandbox AWS account, which the provider refuses to run against any other. TF_VAR_workload_account_id, from the repository variable HEAT_SANDBOX_ACCOUNT_ID or the private script in docs/private/."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.workload_account_id))
    error_message = "workload_account_id must be a 12-digit AWS account id."
  }
}

variable "issue" {
  description = "The issue number from the branch name <type>/<issue>-<description>: the stack is heat-sb<issue> and its state key is environment/sandbox/<issue>/terraform.tfstate."
  type        = number

  validation {
    condition     = var.issue == floor(var.issue) && var.issue > 0
    error_message = "issue must be a positive whole number."
  }
}
