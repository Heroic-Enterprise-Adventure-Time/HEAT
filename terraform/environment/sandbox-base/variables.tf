# Three values this root never commits (docs/README.md, rule 9). The sandbox
# account's id arrives in the pipeline as TF_VAR_workload_account_id from the
# repository variable HEAT_SANDBOX_ACCOUNT_ID, and the provider uses it only
# to refuse credentials for any other account. The Google OAuth client's id
# and secret arrive from the sandbox-base GitHub environment, as
# TF_VAR_google_client_id from the variable HEAT_GOOGLE_CLIENT_ID and
# TF_VAR_google_client_secret from the secret HEAT_GOOGLE_CLIENT_SECRET, one
# name in every environment (decision 0020); the secret is this root's only
# one and is marked sensitive. On a laptop all three come from the private
# script in docs/private/ or a terraform.tfvars beside this file (ignored by
# git; see terraform.tfvars.example). The test users' password is not here:
# it goes to the CLI step of the apply job, never to Terraform (decision
# 0020).

variable "workload_account_id" {
  description = "The heat-sandbox AWS account, which the provider refuses to run against any other."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.workload_account_id))
    error_message = "workload_account_id must be a 12-digit AWS account id."
  }
}

variable "google_client_id" {
  description = "The Google OAuth client registered for auth.heat-sb.dcg-games.com: its client id, from the sandbox-base environment's variable HEAT_GOOGLE_CLIENT_ID."
  type        = string
}

variable "google_client_secret" {
  description = "That client's secret, from the sandbox-base environment's secret HEAT_GOOGLE_CLIENT_SECRET. Sensitive."
  type        = string
  sensitive   = true
}
