# Read by the apply job (the pool, the bucket and the facts config.json
# carries; the pool's name for reading back) and by
# whoever reads the environment back. Nothing here is secret and nothing
# carries the account id.

output "zone_id" {
  value = module.base.zone_id
}

output "zone_name" {
  description = "heat.dcg-games.com: prod's hostname."
  value       = module.base.zone_name
}

output "zone_name_servers" {
  description = "What the dcg-platform session reads to delegate heat.dcg-games.com; it reads them from Route 53 itself, so this output is for checking."
  value       = module.base.zone_name_servers
}

output "user_pool_id" {
  description = "Read by the apply job with terraform output -raw, for config.json."
  value       = module.base.user_pool_id
}

output "user_pool_name" {
  description = "heat-prod-base-users, for reading back; no script mints a user in it."
  value       = module.base.user_pool_name
}

output "certificate_arn" {
  description = "The certificate for heat.dcg-games.com and *.heat.dcg-games.com."
  value       = module.base.certificate_arn
}

output "login_host" {
  description = "https://auth.heat.dcg-games.com, the pool's managed login host; read by the apply job for config.json."
  value       = module.login_domain.login_host
}

output "browser_client_id" {
  description = "prod's browser app client; read by the apply job for config.json."
  value       = module.environment.browser_client_id
}

output "site_url" {
  description = "https://heat.dcg-games.com: the page at /, POST /graphql with a Bearer token."
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
  description = "/heat/heat-prod: site_url, api_url, user_pool_id, browser_client_id, login_host; no app_client_id, since prod has no ci client."
  value       = module.environment.parameter_prefix
}

output "alarm_topic_arn" {
  description = "The topic prod's alarms notify, for reading back."
  value       = module.environment.alarm_topic_arn
}
