# What the root, the workflow's job summary and the next issues need.
# Nothing here is secret and nothing carries the account id.

output "api_url" {
  description = "The HTTP API's invoke URL; POST /graphql with a Bearer token from the app client."
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "api_id" {
  description = "The HTTP API's id, which Issue-39's CloudFront origin names."
  value       = aws_apigatewayv2_api.this.id
}

output "function_names" {
  description = "Function name by manifest name; the log group is /aws/lambda/<function name>."
  value       = { for name, fn in aws_lambda_function.function : name => fn.function_name }
}

output "table_names" {
  value = {
    player   = aws_dynamodb_table.player.name
    location = aws_dynamodb_table.location.name
  }
}

output "parameter_prefix" {
  description = "Where the stack's parameters live: api_url, user_pool_id, app_client_id under this path."
  value       = local.parameter_prefix
}

output "site_url" {
  description = "https://<hostname>: the page, and /graphql through the same origin."
  value       = module.site.site_url
}

output "client_bucket" {
  description = "The bucket the apply job syncs the client build and config.json into."
  value       = module.site.client_bucket
}

output "distribution_id" {
  value = module.site.distribution_id
}
