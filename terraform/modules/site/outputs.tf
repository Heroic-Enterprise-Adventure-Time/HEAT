# What the environment module, the root and the workflow need. Nothing here
# is secret and nothing carries the account id.

output "site_url" {
  description = "https://<hostname>: the page at /, the API at its paths."
  value       = "https://${var.hostname}"
}

output "client_bucket" {
  description = "The bucket the apply job syncs the client build into."
  value       = aws_s3_bucket.client.bucket
}

output "distribution_id" {
  description = "The distribution's id, for reading it back; nothing invalidates it (the page has a short lifetime and the assets are hashed)."
  value       = aws_cloudfront_distribution.this.id
}

output "distribution_domain_name" {
  description = "The distribution's own name, <id>.cloudfront.net, which the hostname aliases."
  value       = aws_cloudfront_distribution.this.domain_name
}
