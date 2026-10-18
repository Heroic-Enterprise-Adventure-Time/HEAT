# The environment's one hostname (decision 0018): a CloudFront distribution
# whose default behavior serves the client from the bucket through origin
# access control, and whose ordered behaviors send the API's paths to the
# HTTP API's default endpoint with caching off. The browser sees one origin
# for the page and the API: no CORS, no custom domain on the gateway.
#
# Every policy is one of CloudFront's managed ones, found by name, so there
# is no policy resource to keep current:
#   CachingOptimized           the page and its hashed assets; the origin's
#                              Cache-Control decides the lifetime, between
#                              one second and a year
#   CachingDisabled            the API: every request reaches the origin
#   AllViewerExceptHostHeader  forwards every viewer header, cookie and
#                              query string but Host, which API Gateway
#                              needs to be its own name; Authorization is
#                              forwarded on POST (decision 0018, facts)
#   SecurityHeadersPolicy      Referrer-Policy, Strict-Transport-Security,
#                              X-Content-Type-Options, X-Frame-Options,
#                              X-XSS-Protection, the same in every
#                              environment; a Content-Security-Policy is a
#                              custom policy and arrives with sign-in
#                              (Issue-46), when the origins it must name
#                              are known

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host_header" {
  name = "Managed-AllViewerExceptHostHeader"
}

data "aws_cloudfront_response_headers_policy" "security_headers" {
  name = "Managed-SecurityHeadersPolicy"
}

# CloudFront signs its requests to the bucket as itself; the bucket policy
# admits that signature for this distribution alone (bucket.tf).
resource "aws_cloudfront_origin_access_control" "client" {
  name                              = "${var.name_prefix}-client"
  description                       = "${var.name_prefix}: the distribution's read of the client bucket."
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "this" {
  enabled             = true
  comment             = "${var.name_prefix}: ${var.hostname}"
  aliases             = [var.hostname]
  default_root_object = "index.html"
  is_ipv6_enabled     = true
  http_version        = "http2and3"
  price_class         = var.price_class

  # Terraform waits for the distribution to be deployed on create and on
  # change, so an apply that returns has a hostname that answers; and on
  # destroy it disables the distribution, waits, and deletes it, so a
  # branch's deletion leaves nothing behind (retain_on_delete is off, its
  # default). Both waits are minutes; the destroy job of
  # .github/workflows/sandbox.yml carries them.
  wait_for_deployment = true

  origin {
    origin_id                = "client"
    domain_name              = aws_s3_bucket.client.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.client.id
  }

  origin {
    origin_id   = "api"
    domain_name = var.api_host

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "client"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_optimized.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security_headers.id

    # A route of the single-page application is served as the page; the
    # router reads the path (function.tf).
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_routes.arn
    }
  }

  # One behavior per API path, each an exact pattern: /graphql today. The
  # viewer must already be on HTTPS, since nothing links to these paths
  # over HTTP and a redirect would turn a POST into a GET.
  dynamic "ordered_cache_behavior" {
    for_each = toset(var.api_paths)

    content {
      path_pattern           = ordered_cache_behavior.value
      target_origin_id       = "api"
      viewer_protocol_policy = "https-only"
      allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods         = ["GET", "HEAD"]
      compress               = true

      cache_policy_id            = data.aws_cloudfront_cache_policy.caching_disabled.id
      origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_viewer_except_host_header.id
      response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security_headers.id
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = var.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}
