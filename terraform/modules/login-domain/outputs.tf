output "login_host" {
  description = "https://auth.<zone name>: the managed login pages and the OAuth endpoints every browser client of the pool uses. What config.json carries to the client and what the owner's Google OAuth client names."
  value       = "https://${aws_route53_record.this.fqdn}"
}

output "cloudfront_distribution" {
  description = "The hostname of the distribution Cognito runs for the domain, for reading back."
  value       = aws_cognito_user_pool_domain.this.cloudfront_distribution
}
