# The hostname, in the account's zone: an alias to the distribution for IPv4
# and for IPv6, since the distribution answers on both. An alias record
# costs nothing per query and follows the distribution's own addresses.
# CloudFront's hosted zone id is one value for every distribution, which
# the resource exposes, so nothing is typed in.
resource "aws_route53_record" "site" {
  for_each = toset(["A", "AAAA"])

  zone_id = var.zone_id
  name    = var.hostname
  type    = each.value

  alias {
    name                   = aws_cloudfront_distribution.this.domain_name
    zone_id                = aws_cloudfront_distribution.this.hosted_zone_id
    evaluate_target_health = false
  }
}
