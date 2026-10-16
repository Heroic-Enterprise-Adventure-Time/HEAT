# The values this repository never commits: AWS account ids. They are given
# at plan time through terraform.tfvars (ignored by git; see
# terraform.tfvars.example) or the environment variables TF_VAR_platform_account_id
# and TF_VAR_workload_account_ids.
variable "platform_account_id" {
  description = "The heat-platform AWS account. The provider refuses credentials for any other account."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.platform_account_id))
    error_message = "platform_account_id must be a 12-digit AWS account id."
  }
}

# The bucket policy names each account's plan and apply roles by ARN, and
# IAM refuses a policy that names a role that does not exist. So an account
# is listed here only once its bootstrap root is applied, and the sequence
# for a new account is bootstrap root first, backend second (README.md).
variable "workload_account_ids" {
  description = "The workload accounts whose roles may use their environment's state keys, keyed by environment name: sandbox, dev, prod. List an account once its bootstrap root is applied."
  type        = map(string)
  default     = {}

  validation {
    condition     = alltrue([for name, id in var.workload_account_ids : contains(["sandbox", "dev", "prod"], name)])
    error_message = "workload_account_ids may only have the keys sandbox, dev and prod."
  }

  validation {
    condition     = alltrue([for name, id in var.workload_account_ids : can(regex("^[0-9]{12}$", id))])
    error_message = "Every value in workload_account_ids must be a 12-digit AWS account id."
  }
}
