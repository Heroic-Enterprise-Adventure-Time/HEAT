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
  description = "The base's ci app client, the password flow for the stack test; read from the base."
  value       = local.ci_client_id
}

output "app_version" {
  description = "The deploy's version; read by the apply job for config.json (decision 0030)."
  value       = module.environment.app_version
}

output "password_sign_in" {
  description = "Whether the browser client offers email and password beside Google; read by the apply job for config.json."
  value       = module.environment.password_sign_in
}

output "browser_client_id" {
  description = "The stack's browser app client; read by the apply job for config.json."
  value       = module.environment.browser_client_id
}

output "login_host" {
  description = "https://auth.heat-sb.dcg-games.com; read by the apply job for config.json."
  value       = module.environment.login_host
}

output "user_pool_id" {
  value = one(data.aws_cognito_user_pools.base.ids)
}

output "site_url" {
  description = "The stack's hostname: the page at /, POST /graphql with a Bearer token."
  value       = module.environment.site_url
}

output "client_bucket" {
  description = "Read by the apply job, which syncs the client build and writes config.json into it."
  value       = module.environment.client_bucket
}

output "distribution_id" {
  value = module.environment.distribution_id
}
