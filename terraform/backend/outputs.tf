output "state_bucket" {
  description = "Name of the Terraform state bucket. Other stacks' backend blocks name it directly; this output is for people."
  value       = aws_s3_bucket.state.bucket
}

output "state_bucket_arn" {
  value = aws_s3_bucket.state.arn
}
