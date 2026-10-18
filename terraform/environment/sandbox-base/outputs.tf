# Read by the apply job (the pool id, for the test users) and by whoever
# needs the zone's name servers or the ci client's id. Nothing here is
# secret, and none of it carries the account id.

output "zone_id" {
  value = module.base.zone_id
}

output "zone_name_servers" {
  description = "What the dcg-platform session reads to delegate heat-sb.dcg-games.com; it reads them from Route 53 itself, so this output is for checking."
  value       = module.base.zone_name_servers
}

output "user_pool_id" {
  description = "Read by the apply job with terraform output -raw, for the test-user step."
  value       = module.base.user_pool_id
}

output "user_pool_arn" {
  value = module.base.user_pool_arn
}

output "user_pool_endpoint" {
  value = module.base.user_pool_endpoint
}

output "login_host" {
  description = "The pool's managed login host, https://heat-sb.auth.us-east-1.amazoncognito.com; the per-issue stacks derive it from the same prefix literal rather than reading this output."
  value       = module.base.login_host
}

output "ci_client_id" {
  value = module.base.ci_client_id
}

output "certificate_arn" {
  description = "The certificate for heat-sb.dcg-games.com and *.heat-sb.dcg-games.com; the per-issue stacks find it by its domain through a data source, never through this output."
  value       = module.base.certificate_arn
}
