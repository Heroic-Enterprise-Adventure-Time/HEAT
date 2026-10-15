locals {
  tags = {
    Project     = "heat"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# The default provider is heat-platform: the account whose credentials the
# owner holds, and where state is read and written. Nothing is created with
# it. It exists so that a terminal still holding credentials for some other
# account fails here, before anything is planned.
provider "aws" {
  region              = "us-east-1"
  allowed_account_ids = [var.platform_account_id]

  default_tags {
    tags = local.tags
  }
}

# Forces the default provider to be configured, and so the account check to
# run, even though no resource uses it.
data "aws_caller_identity" "platform" {}

# The workload account, reached by assuming the role the organization layer
# placed there for exactly this (dcg-platform decision 0008). One hop from the
# owner's Admin session. Refuses credentials for any other account.
provider "aws" {
  alias               = "workload"
  region              = "us-east-1"
  allowed_account_ids = [var.workload_account_id]

  assume_role {
    role_arn     = "arn:aws:iam::${var.workload_account_id}:role/PlatformAdminRole"
    session_name = "terraform-bootstrap"
  }

  default_tags {
    tags = local.tags
  }
}
