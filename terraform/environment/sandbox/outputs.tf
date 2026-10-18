# Read by the workflow for the job summary and by whoever calls the stack.
# Nothing here is secret and nothing carries the account id.

output "api_url" {
  description = "POST /graphql here with a Bearer token from the ci client."
  value       = module.environment.api_url
}

output "api_id" {
  value = module.environment.api_id
}

output "function_names" {
  value = module.environment.function_names
}

output "table_names" {
  value = module.environment.table_names
}

output "parameter_prefix" {
  value = module.environment.parameter_prefix
}

output "ci_client_id" {
  description = "The app client to sign in with, read from the base."
  value       = local.ci_client_id
}

output "user_pool_id" {
  value = one(data.aws_cognito_user_pools.base.ids)
}
