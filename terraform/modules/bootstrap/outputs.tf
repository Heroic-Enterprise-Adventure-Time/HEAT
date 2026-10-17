# Every ARN here contains the account id, so they are printed and never
# committed. The workflows store none of them: a role ARN is the account id
# variable plus the committed name (README.md, "Applying").

output "plan_role_arn" {
  description = "The plan role's ARN: what the agent's plan-heat-<environment> profile and the pull request plan job assume."
  value       = aws_iam_role.plan.arn
}

output "apply_role_arn" {
  description = "The apply role's ARN: what the apply jobs assume under their GitHub environment."
  value       = aws_iam_role.apply.arn
}

output "permissions_boundary_arn" {
  description = "The boundary every role the environment stacks create must carry."
  value       = aws_iam_policy.boundary.arn
}

output "github_oidc_provider_arn" {
  value = aws_iam_openid_connect_provider.github.arn
}
