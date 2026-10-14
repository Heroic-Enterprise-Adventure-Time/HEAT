# The one value this repository never commits: an AWS account id. It is given
# at plan time through terraform.tfvars (ignored by git; see
# terraform.tfvars.example) or the environment variable TF_VAR_platform_account_id.
variable "platform_account_id" {
  description = "The heat-platform AWS account. The provider refuses credentials for any other account."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.platform_account_id))
    error_message = "platform_account_id must be a 12-digit AWS account id."
  }
}
