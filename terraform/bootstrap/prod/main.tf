# The prod root of the bootstrap stack: one module call with prod's values
# as literals (decision 0016). The apply role trusts the GitHub environment
# prod exactly, which only a v* tag may deploy to (decision 0011's gate,
# kept by 0017).
module "bootstrap" {
  source = "../../modules/bootstrap"

  providers = {
    aws          = aws
    aws.workload = aws.workload
  }

  environment           = local.environment
  github_environment    = "prod"
  monthly_budget_usd    = 10
  workload_account_id   = var.workload_account_id
  management_account_id = var.management_account_id
  budget_alert_email    = var.budget_alert_email
}
