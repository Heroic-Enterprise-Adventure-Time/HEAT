# The prod root of the bootstrap stack: one module call with prod's values
# as literals (decision 0016). The apply role trusts the GitHub environment
# prod exactly, whose branch policy admits main and release: a merge to
# release applies, and a pull request's plan runs on main's ref (decisions
# 0020 and 0021).
module "bootstrap" {
  source = "../../modules/bootstrap"

  providers = {
    aws          = aws
    aws.workload = aws.workload
  }

  environment             = local.environment
  github_environment      = "prod"
  plan_github_environment = "prod"
  monthly_budget_usd      = 10
  workload_account_id     = var.workload_account_id
  management_account_id   = var.management_account_id
  budget_alert_email      = var.budget_alert_email
}
