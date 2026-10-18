# A per-issue sandbox stack: the environment module with the sandbox's
# literals (decision 0016), on top of the base that every stack in this
# account shares (terraform/environment/sandbox-base). The base is read by
# name through data sources, not through its state, so this root depends
# on what exists in the account and not on how the base's state is laid out.

data "aws_cognito_user_pools" "base" {
  name = "heat-sb-base-users"
}

data "aws_cognito_user_pool_clients" "base" {
  user_pool_id = one(data.aws_cognito_user_pools.base.ids)
}

locals {
  # The ci client is the password-flow client the end-to-end tests and the
  # agent sign in with (decision 0018); the lists are aligned by index.
  ci_client_id = data.aws_cognito_user_pool_clients.base.client_ids[
    index(data.aws_cognito_user_pool_clients.base.client_names, "ci")
  ]
}

module "environment" {
  source = "../../modules/environment"

  name_prefix = local.name_prefix
  environment = local.environment

  functions = jsondecode(file("${path.module}/../../../manifest.json")).functions
  dist_dir  = "${path.module}/../../../dist"

  user_pool_id  = one(data.aws_cognito_user_pools.base.ids)
  app_client_id = local.ci_client_id

  permissions_boundary_arn = "arn:aws:iam::${var.workload_account_id}:policy/heat-sandbox-boundary"

  # A sandbox stack lives as long as its branch: short retention, no
  # recovery, no deletion protection. The throttle, with the account's
  # Lambda concurrency of 10 shared by every stack, is the kill switch.
  log_retention_days     = 7
  point_in_time_recovery = false
  deletion_protection    = false
  throttling_rate_limit  = 10
  throttling_burst_limit = 20
}
