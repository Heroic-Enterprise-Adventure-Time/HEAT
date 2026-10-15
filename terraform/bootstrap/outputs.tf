output "deploy_role_arn" {
  description = "The deploy role's ARN. The owner copies it into the repository variable the deploy workflow reads. It contains the account id, so it is printed and never committed."
  value       = aws_iam_role.deploy.arn
}

output "deploy_role_name" {
  value = aws_iam_role.deploy.name
}

output "github_oidc_provider_arn" {
  value = aws_iam_openid_connect_provider.github.arn
}
