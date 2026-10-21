# Read by the apply job (the pool, the bucket and the facts config.json
# carries; the pool's name and the zone's for the smoke test's user) and by
# whoever reads the environment back. Nothing here is secret and nothing
# carries the account id.

output "zone_id" {
  value = module.base.zone_id
}

output "zone_name" {
  description = "heat-dev.dcg-games.com: dev's hostname and the domain of its test users."
  value       = module.base.zone_name
}

output "zone_name_servers" {
  description = "What the dcg-platform session reads to delegate heat-dev.dcg-games.com; it reads them from Route 53 itself, so this output is for checking."
  value       = module.base.zone_name_servers
}

output "user_pool_id" {
  description = "Read by the apply job with terraform output -raw, for the test-user step and config.json."
  value       = module.base.user_pool_id
}

output "user_pool_name" {
  description = "heat-dev-base-users: what scripts/e2e-user.sh looks the pool up by for the smoke test's user."
  value       = module.base.user_pool_name
}

output "ci_client_id" {
  description = "The base's ci app client, the password flow the smoke test and the test users sign in with."
  value       = module.base.ci_client_id
}

output "certificate_arn" {
  description = "The certificate for heat-dev.dcg-games.com and *.heat-dev.dcg-games.com."
  value       = module.base.certificate_arn
}

output "login_host" {
  description = "https://auth.heat-dev.dcg-games.com, the pool's managed login host; read by the apply job for config.json."
  value       = module.login_domain.login_host
}

output "password_sign_in" {
  description = "Whether the browser client offers email and password beside Google; read by the apply job for config.json."
  value       = module.environment.password_sign_in
}

output "browser_client_id" {
  description = "dev's browser app client; read by the apply job for config.json."
  value       = module.environment.browser_client_id
}

output "site_url" {
  description = "https://heat-dev.dcg-games.com: the page at /, POST /graphql with a Bearer token."
  value       = module.environment.site_url
}

output "api_url" {
  description = "The HTTP API behind the site, which answers the same without the distribution in front."
  value       = module.environment.api_url
}

output "client_bucket" {
  description = "Read by the apply job, which syncs the client build and writes config.json into it."
  value       = module.environment.client_bucket
}

output "distribution_id" {
  value = module.environment.distribution_id
}

output "function_names" {
  value = module.environment.function_names
}

output "parameter_prefix" {
  description = "/heat/heat-dev: site_url, api_url, user_pool_id, app_client_id, browser_client_id, login_host."
  value       = module.environment.parameter_prefix
}

output "alarm_topic_arn" {
  description = "The topic dev's alarms notify, for reading back."
  value       = module.environment.alarm_topic_arn
}
