# The dev environment's committed values. Used as: terraform plan -var-file=dev.tfvars
# Nothing private belongs here. The account ids come from TF_VAR_* or from
# terraform.tfvars, which git ignores.
environment        = "dev"
github_environment = "dev"
