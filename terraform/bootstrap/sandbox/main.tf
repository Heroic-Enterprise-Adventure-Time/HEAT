# The sandbox root of the bootstrap stack: one module call with the sandbox
# account's values as literals (decision 0016). The GitHub environment is a
# pattern, because every per-issue stack runs under its own environment,
# sandbox-<issue> (decision 0019). The budget is twice dev's: this account
# holds several stacks at once, each with its own distribution and API.
module "bootstrap" {
  source = "../../modules/bootstrap"

  providers = {
    aws          = aws
    aws.workload = aws.workload
  }

  environment             = local.environment
  github_environment      = "sandbox-*"
  plan_github_environment = "sandbox-base"
  monthly_budget_usd      = 20
  workload_account_id     = var.workload_account_id
  management_account_id   = var.management_account_id
  budget_alert_email      = var.budget_alert_email
}
