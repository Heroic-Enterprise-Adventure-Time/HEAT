# What the stacks of this account, and the apply job, need from the base.
# None of these is secret: pool and client ids are public by design (the
# browser carries them), and the name servers are what the parent zone
# publishes.

output "zone_id" {
  description = "The hosted zone's id, for the records the environment stacks create in it."
  value       = aws_route53_zone.this.zone_id
}

output "zone_name" {
  description = "The hosted zone's name, without a trailing dot."
  value       = aws_route53_zone.this.name
}

output "zone_name_servers" {
  description = "The four name servers Route 53 assigned to the zone: what the organization layer writes into the parent zone's NS record."
  value       = aws_route53_zone.this.name_servers
}

output "user_pool_id" {
  description = "The shared user pool's id: what the apply job creates test users in, and what every stack's app client and authorizer refer to."
  value       = aws_cognito_user_pool.this.id
}

output "user_pool_name" {
  description = "The shared user pool's name, <prefix>-users: what scripts/e2e-user.sh looks the pool up by."
  value       = aws_cognito_user_pool.this.name
}

output "user_pool_arn" {
  description = "The shared user pool's ARN, for the authorizers' and functions' policies."
  value       = aws_cognito_user_pool.this.arn
}

output "user_pool_endpoint" {
  description = "The pool's endpoint, cognito-idp.<region>.amazonaws.com/<pool id>: the token issuer the authorizers verify against."
  value       = aws_cognito_user_pool.this.endpoint
}

output "ci_client_id" {
  description = "The id of the ci app client: what the end-to-end tests pass to InitiateAuth."
  value       = aws_cognito_user_pool_client.ci.id
}

output "certificate_arn" {
  description = "The account's certificate for the zone name and its wildcard, in us-east-1, taken from the validation waiter so that it is issued by the time anything reads it: what every distribution under the zone serves."
  value       = aws_acm_certificate_validation.this.certificate_arn
}
