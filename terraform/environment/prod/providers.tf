locals {
  environment = "prod"
  name_prefix = "heat-prod"

  tags = {
    Project     = "heat"
    Environment = local.environment
    Stack       = local.name_prefix
    ManagedBy   = "terraform"
  }
}

# One provider, the heat-prod account itself: the apply role under the prod
# GitHub environment, or the plan role through the agent's plan-heat-prod
# profile (decision 0017). The account check refuses any other identity
# before anything is planned.
provider "aws" {
  region              = "us-east-1"
  allowed_account_ids = [var.workload_account_id]

  default_tags {
    tags = local.tags
  }
}
