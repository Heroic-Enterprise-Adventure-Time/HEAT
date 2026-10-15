# The dev root of the bootstrap stack: one module call with dev's values as
# literals. A second environment is a second directory beside this one with
# its own backend key and its own literals (decision 0016).
module "bootstrap" {
  source = "../../modules/bootstrap"

  providers = {
    aws          = aws
    aws.workload = aws.workload
  }

  environment         = local.environment
  github_environment  = "dev"
  monthly_budget_usd  = 10
  workload_account_id = var.workload_account_id
  budget_alert_email  = var.budget_alert_email
}

# The four resources existed at this root before the module did (#12, #20).
# These keep the state in step with the new addresses, so the plan after the
# move shows four "has moved" lines and no changes. Recorded in state by the
# apply that follows; the blocks stay as history.
moved {
  from = aws_iam_openid_connect_provider.github
  to   = module.bootstrap.aws_iam_openid_connect_provider.github
}

moved {
  from = aws_iam_role.deploy
  to   = module.bootstrap.aws_iam_role.deploy
}

moved {
  from = aws_iam_role_policy.deploy
  to   = module.bootstrap.aws_iam_role_policy.deploy
}

moved {
  from = aws_budgets_budget.monthly_cost
  to   = module.bootstrap.aws_budgets_budget.monthly_cost
}
