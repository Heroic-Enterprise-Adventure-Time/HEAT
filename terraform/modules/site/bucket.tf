# The client bucket: what the Angular build is synced into by the apply job,
# read by nobody but the distribution. Private in every way S3 offers:
# public access blocked, no ACLs (the account default since 2023 is
# bucket-owner-enforced), encrypted at rest with S3's own keys, and a bucket
# policy that admits only this distribution's origin access control.
#
# No versioning: the objects are a build artifact, written again on every
# push from the commit that is checked out, so there is nothing to recover
# that git does not already hold. force_destroy for the same reason: a
# destroy, on the branch's deletion, empties the bucket itself.
resource "aws_s3_bucket" "client" {
  bucket        = "${var.name_prefix}-client"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "client" {
  bucket = aws_s3_bucket.client.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "client" {
  bucket = aws_s3_bucket.client.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# The policy AWS documents for origin access control: the CloudFront service
# principal may read objects, and only on behalf of this one distribution
# (CloudFront developer guide, "Restrict access to an Amazon S3 origin",
# read 2026-10-17). GetObject only: a key that does not exist answers 403
# rather than 404, which is the documented trade for not granting ListBucket.
data "aws_iam_policy_document" "client" {
  statement {
    sid     = "AllowCloudFrontServicePrincipalReadOnly"
    effect  = "Allow"
    actions = ["s3:GetObject"]

    resources = ["${aws_s3_bucket.client.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.this.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "client" {
  bucket = aws_s3_bucket.client.id
  policy = data.aws_iam_policy_document.client.json

  # The block must exist before a policy is written, or S3 refuses a policy
  # that could have been public.
  depends_on = [aws_s3_bucket_public_access_block.client]
}
