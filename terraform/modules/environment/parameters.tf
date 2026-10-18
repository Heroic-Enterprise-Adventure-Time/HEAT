# The stack's public facts, for whatever calls it: the end-to-end tests, the
# agent, the Angular dev server's proxy, Issue-39's config.json. Non-secret
# configuration lives in Parameter Store, written by Terraform; the
# repository holds the names, never the values (overview, "Environments").
# The functions themselves read environment variables, set on them from the
# same Terraform values, because nothing here changes between deployments.

locals {
  parameter_prefix = "/heat/${var.name_prefix}"
}

resource "aws_ssm_parameter" "api_url" {
  name        = "${local.parameter_prefix}/api_url"
  description = "The HTTP API's invoke URL, serving /graphql."
  type        = "String"
  value       = aws_apigatewayv2_stage.default.invoke_url
}

resource "aws_ssm_parameter" "user_pool_id" {
  name        = "${local.parameter_prefix}/user_pool_id"
  description = "The user pool that issues this stack's tokens."
  type        = "String"
  value       = var.user_pool_id
}

resource "aws_ssm_parameter" "app_client_id" {
  name        = "${local.parameter_prefix}/app_client_id"
  description = "The app client to sign in with."
  type        = "String"
  value       = var.app_client_id
}

resource "aws_ssm_parameter" "site_url" {
  name        = "${local.parameter_prefix}/site_url"
  description = "The environment's hostname, serving the page and /graphql."
  type        = "String"
  value       = module.site.site_url
}
