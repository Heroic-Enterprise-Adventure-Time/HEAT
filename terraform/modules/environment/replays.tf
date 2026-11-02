# The replay bucket: one timeline per settled adventure, <adventureId>.json,
# written by the hub before the settlement transaction and read back
# through the hub for a replay (decision 0030; overview, "Services and
# data"). Private in every way S3 offers, as the client bucket is: public
# access blocked, no ACLs (bucket-owner-enforced is the account default),
# encrypted at rest with S3's own keys, and a policy that refuses any
# request not made over TLS (Security Hub control S3.5). The function's
# role is the only reader and writer (functions.tf); there is no
# distribution in front of it.
#
# force_destroy follows deletion protection: a sandbox stack's destroy
# empties the bucket, every version of every object, and a destroy of dev
# or prod refuses to delete players' timelines.
resource "aws_s3_bucket" "replays" {
  bucket        = "${var.name_prefix}-replays"
  force_destroy = !var.deletion_protection
}

# Versioned: an object is written once, with If-None-Match, and never
# changed, so no version is ever noncurrent and versioning stores nothing
# twice; what it buys is that a timeline deleted by mistake can be put back
# (Issue-157, trivy's AVD-AWS-0090).
resource "aws_s3_bucket_versioning" "replays" {
  bucket = aws_s3_bucket.replays.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "replays" {
  bucket = aws_s3_bucket.replays.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "replays" {
  bucket = aws_s3_bucket.replays.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

data "aws_iam_policy_document" "replays" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]

    resources = [
      aws_s3_bucket.replays.arn,
      "${aws_s3_bucket.replays.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "replays" {
  bucket = aws_s3_bucket.replays.id
  policy = data.aws_iam_policy_document.replays.json

  depends_on = [aws_s3_bucket_public_access_block.replays]
}
