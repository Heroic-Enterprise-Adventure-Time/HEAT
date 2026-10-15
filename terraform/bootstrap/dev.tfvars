# The dev environment's committed values. Used as: terraform plan -var-file dev.tfvars
# Nothing private belongs here. The account ids and the alert address come from
# terraform.tfvars, which git ignores, or from TF_VAR_*.
environment        = "dev"
github_environment = "dev"
monthly_budget_usd = 10
