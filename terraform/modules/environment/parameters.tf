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

# Only where the base has a ci client; prod has none and no parameter, so
# that nothing reading the prefix is told of a password flow that does not
# exist (Issue-41). The moved block keeps the sandbox's and dev's parameter
# in place from when the resource gained its count.
resource "aws_ssm_parameter" "app_client_id" {
  count = var.app_client_id == null ? 0 : 1

  name        = "${local.parameter_prefix}/app_client_id"
  description = "The base's ci app client: the password flow, for the stack test and the agent."
  type        = "String"
  value       = var.app_client_id
}

moved {
  from = aws_ssm_parameter.app_client_id
  to   = aws_ssm_parameter.app_client_id[0]
}

resource "aws_ssm_parameter" "browser_client_id" {
  name        = "${local.parameter_prefix}/browser_client_id"
  description = "The stack's browser app client: the code grant with PKCE through managed login."
  type        = "String"
  value       = aws_cognito_user_pool_client.browser.id
}

resource "aws_ssm_parameter" "login_host" {
  name        = "${local.parameter_prefix}/login_host"
  description = "The pool's managed login host, where the browser client signs in."
  type        = "String"
  value       = var.login_host
}

resource "aws_ssm_parameter" "site_url" {
  name        = "${local.parameter_prefix}/site_url"
  description = "The environment's hostname, serving the page and /graphql."
  type        = "String"
  value       = module.site.site_url
}
