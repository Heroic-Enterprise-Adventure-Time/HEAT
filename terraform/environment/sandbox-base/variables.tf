# The one value this root never commits: the sandbox account's id
# (docs/README.md, rule 9). In the pipeline it arrives as
# TF_VAR_workload_account_id from the repository variable
# HEAT_SANDBOX_ACCOUNT_ID; on a laptop from the private script in
# docs/private/ or a terraform.tfvars beside this file (ignored by git; see
# terraform.tfvars.example). The provider uses it only to refuse credentials
# for any other account. Nothing else about the base is a variable, and this
# root takes no secret: the test users' password goes to the CLI step of the
# apply job, never to Terraform (decision 0020).

variable "workload_account_id" {
  description = "The heat-sandbox AWS account, which the provider refuses to run against any other."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.workload_account_id))
    error_message = "workload_account_id must be a 12-digit AWS account id."
  }
}
