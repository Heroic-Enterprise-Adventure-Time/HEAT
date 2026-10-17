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

output "ci_client_id" {
  value = module.base.ci_client_id
}
