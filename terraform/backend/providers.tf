# The backend root's one provider, heat-platform, where the state bucket
# lives, and the tags the bucket carries, set once here (terraform.md, rule
# 7). The account id is a variable because this repository commits none
# (variables.tf).
locals {
  tags = {
    Project     = "heat"
    Environment = "platform"
    Stack       = "backend"
    ManagedBy   = "terraform"
  }
}

provider "aws" {
  region = "us-east-1"

  # Refuses to run with credentials for any other AWS account.
  allowed_account_ids = [var.platform_account_id]

  default_tags {
    tags = local.tags
  }
}
