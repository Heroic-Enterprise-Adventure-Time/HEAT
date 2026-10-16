output "deploy_role_arn" {
  description = "The deploy role's ARN, for the repository variable HEAT_DEV_DEPLOY_ROLE_ARN. Printed, never committed."
  value       = module.bootstrap.deploy_role_arn
}

output "deploy_role_name" {
  value = module.bootstrap.deploy_role_name
}

output "github_oidc_provider_arn" {
  value = module.bootstrap.github_oidc_provider_arn
}
