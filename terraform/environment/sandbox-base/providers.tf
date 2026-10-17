locals {
  environment = "sandbox"

  tags = {
    Project     = "heat"
    Environment = local.environment
    Stack       = "base"
    ManagedBy   = "terraform"
  }
}

# One provider, the heat-sandbox account itself. Unlike the bootstrap roots,
# nothing is assumed here: the identity running this root is already a role
# in the account, the apply role under the sandbox-base GitHub environment
# or the plan role through the agent's plan-heat-sandbox profile (decision
# 0017). The account check refuses any other identity before anything is
# planned, and the bucket's policy in heat-platform lets these two roles at
# the state.
provider "aws" {
  region              = "us-east-1"
  allowed_account_ids = [var.workload_account_id]

  default_tags {
    tags = local.tags
  }
}
