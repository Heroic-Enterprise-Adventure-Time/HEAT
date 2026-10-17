# The dev root of the bootstrap stack: one module call with dev's values as
# literals. Each environment is a directory beside this one with its own
# backend key and its own literals (decision 0016).
module "bootstrap" {
  source = "../../modules/bootstrap"

  providers = {
    aws          = aws
    aws.workload = aws.workload
  }

  environment             = local.environment
  github_environment      = "dev"
  plan_github_environment = "dev"
  monthly_budget_usd      = 10
  workload_account_id     = var.workload_account_id
  management_account_id   = var.management_account_id
  budget_alert_email      = var.budget_alert_email
}

# The four resources existed at this root before the module did (Issue-12,
# Issue-19). These kept the state in step with the new addresses in Issue-21,
# and stay as history, as HashiCorp recommends. Two of them name the deploy
# role that Issue-36 removed: a moved block whose target is no longer in the
# configuration is accepted (checked with Terraform 1.14.6 on 2026-10-16),
# and the role's destruction is planned from the state as usual.
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
