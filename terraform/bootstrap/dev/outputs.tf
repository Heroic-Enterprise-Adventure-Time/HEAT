output "plan_role_arn" {
  description = "The plan role's ARN, for the agent's plan-heat-dev profile. Printed, never committed."
  value       = module.bootstrap.plan_role_arn
}

output "apply_role_arn" {
  description = "The apply role's ARN. The workflows build it from HEAT_DEV_ACCOUNT_ID and the committed name; printed here for checking."
  value       = module.bootstrap.apply_role_arn
}

output "permissions_boundary_arn" {
  value = module.bootstrap.permissions_boundary_arn
}

output "github_oidc_provider_arn" {
  value = module.bootstrap.github_oidc_provider_arn
}
