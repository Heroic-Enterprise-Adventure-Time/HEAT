# The HTTP API: the manifest's routes, each behind one JWT authorizer that
# verifies the shared pool's tokens, integrated with each function's live
# alias. The $default stage, auto-deployed, throttled, with an access log
# that shows what the authorizer refused, which the functions never see.
# No custom domain: the environment's hostname is CloudFront's, which sends
# /graphql here (decision 0018, Issue-39).

data "aws_region" "current" {}

resource "aws_apigatewayv2_api" "this" {
  name          = "${var.name_prefix}-api"
  description   = "The ${var.name_prefix} HTTP API: the hub behind CloudFront."
  protocol_type = "HTTP"
}

# The authorizer checks the signature against the pool's keys, the issuer,
# the expiry, and that the token's aud (an ID token) or client_id (an access
# token) is one of the audience entries (API Gateway developer guide, "Control
# access to HTTP APIs with JWT authorizers", read 2026-10-17). The audiences:
# the stack's own browser client (sign_in.tf), whose tokens a player's
# browser carries, and, where the base has one, its ci client, whose tokens
# the stack test carries; prod has no ci client and one audience (Issue-41).
# The claims reach the function in requestContext.authorizer.jwt.claims.
resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id           = aws_apigatewayv2_api.this.id
  name             = "cognito"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    issuer   = "https://cognito-idp.${data.aws_region.current.region}.amazonaws.com/${var.user_pool_id}"
    audience = compact([var.app_client_id, aws_cognito_user_pool_client.browser.id])
  }
}

resource "aws_apigatewayv2_integration" "function" {
  for_each = var.functions

  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_alias.live[each.key].invoke_arn
  payload_format_version = "2.0"
}

# One route per manifest entry, flattened to a map keyed "METHOD /path".
locals {
  routes = merge([
    for name, fn in var.functions : {
      for route in fn.http : "${route.method} ${route.path}" => name
    }
  ]...)
}

resource "aws_apigatewayv2_route" "this" {
  for_each = local.routes

  api_id             = aws_apigatewayv2_api.this.id
  route_key          = each.key
  target             = "integrations/${aws_apigatewayv2_integration.function[each.value].id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_lambda_permission" "api" {
  for_each = var.functions

  statement_id  = "AllowThisApi"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.function[each.key].function_name
  qualifier     = aws_lambda_alias.live[each.key].name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}

resource "aws_cloudwatch_log_group" "api_access" {
  name              = "/aws/apigateway/${var.name_prefix}-api"
  retention_in_days = var.log_retention_days
}

# Served from the base of the API's URL, so the /graphql behavior in
# CloudFront needs no origin path (decision 0018, facts checked).
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = var.throttling_rate_limit
    throttling_burst_limit = var.throttling_burst_limit
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_access.arn
    format = jsonencode({
      requestId        = "$context.requestId"
      time             = "$context.requestTime"
      method           = "$context.httpMethod"
      routeKey         = "$context.routeKey"
      status           = "$context.status"
      responseLength   = "$context.responseLength"
      latencyMs        = "$context.responseLatency"
      ip               = "$context.identity.sourceIp"
      authorizerError  = "$context.authorizer.error"
      integrationError = "$context.integrationErrorMessage"
    })
  }
}
