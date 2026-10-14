locals {
  bucket_name = "heat-platform-terraform-state"

  tags = {
    Project     = "heat"
    Environment = "platform"
    ManagedBy   = "terraform"
  }
}

provider "aws" {
  region = "us-east-1"

  # Refuses to run with credentials for any other AWS account.
  allowed_account_ids = [var.platform_account_id]

  default_tags {
    tags = local.tags
  }
}

# The Terraform state bucket for every stack in this repository.
resource "aws_s3_bucket" "state" {
  bucket = local.bucket_name
}

# Every write keeps the previous version, so a bad apply can be rolled back.
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

# SSE-S3. A customer managed KMS key was considered and not chosen; see
# docs/decisions/0008-terraform-state-backend.md.
resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ACLs off; every object belongs to the bucket owner whoever wrote it.
resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Old state versions are kept for 90 days, then expire. Abandoned multipart
# uploads are cleaned up after 7 days.
resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

data "aws_iam_policy_document" "state" {
  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions = ["s3:*"]

    resources = [
      aws_s3_bucket.state.arn,
      "${aws_s3_bucket.state.arn}/*",
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = data.aws_iam_policy_document.state.json

  # The public access block must exist before a policy is attached, or the
  # policy could in theory be a public one for a moment.
  depends_on = [aws_s3_bucket_public_access_block.state]
}
