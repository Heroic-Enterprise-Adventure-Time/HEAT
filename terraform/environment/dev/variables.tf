# Four values this root never commits (docs/README.md, rule 9; decision 0016
# for the address). In the pipeline all four come from GitHub: the account id
# as TF_VAR_workload_account_id from the repository secret
# HEAT_DEV_ACCOUNT_ID, and the other three from the dev environment under the
# names every environment uses (decision 0020): the variable
# HEAT_GOOGLE_CLIENT_ID, the secret HEAT_GOOGLE_CLIENT_SECRET and the
# variable HEAT_ALARM_EMAIL. On a laptop the account id comes from the private
# script in docs/private/ and the other three are placeholders, because
# dev's values never cross a laptop (decision 0020); the plan is then a
# plan of the shape, and the pull request's or the apply job's plan is the
# one with real values. The test users' password is not here: it goes to the
# CLI step of the apply job, never to Terraform.

variable "workload_account_id" {
  description = "The heat-dev AWS account, which the provider refuses to run against any other."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.workload_account_id))
    error_message = "workload_account_id must be a 12-digit AWS account id."
  }
}

variable "google_client_id" {
  description = "The Google OAuth client registered for auth.heat-dev.dcg-games.com: its client id, from the dev environment's variable HEAT_GOOGLE_CLIENT_ID."
  type        = string
}

variable "google_client_secret" {
  description = "That client's secret, from the dev environment's secret HEAT_GOOGLE_CLIENT_SECRET. Sensitive."
  type        = string
  sensitive   = true
}

variable "alarm_email" {
  description = "The address dev's alarms notify, from the dev environment's variable HEAT_ALARM_EMAIL; the same address the budget alerts go to, kept out of committed files as that one is (decision 0016)."
  type        = string
}

variable "app_version" {
  description = "The deploy's version, the commit being deployed: TF_VAR_app_version from the workflow (github.sha). The environment module checks its shape (decision 0030)."
  type        = string
}
