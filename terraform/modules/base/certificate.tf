# The account's one certificate, for every hostname under the zone: the zone
# name itself, which is dev's and prod's hostname, and its wildcard, which
# covers every per-issue stack (decisions 0015 and 0018). One certificate
# instead of one per stack, because DNS validation takes minutes and is
# paid once here. Requested in us-east-1, the only region CloudFront takes
# a certificate from, which is the region every base runs in.
#
# Validated by DNS through the zone, so the delegation must be live before
# the first apply: ACM gives up on a validation after 72 hours, which is why
# the certificate was moved out of Issue-37 into Issue-39, after Issue-51
# confirmed the delegation on 2026-10-17. ACM renews the certificate itself
# for as long as the validation record stays in the zone and the certificate
# is in use (ACM user guide, "DNS validation", read 2026-10-17).
#
# create_before_destroy, the provider's own recommendation: should the
# certificate ever be replaced, the new one is issued before the old one,
# still attached to the distributions, is removed.
resource "aws_acm_certificate" "this" {
  domain_name               = var.zone_name
  subject_alternative_names = ["*.${var.zone_name}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# One validation record per name on the certificate, the provider's
# documented pattern. ACM issues the same record name and value for a
# wildcard and its base domain (the ACM user guide's table of example CNAME
# records: "Identical"), so the two entries here write one record twice,
# which allow_overwrite makes harmless. The domain names are known at plan
# time; the record names and values are known after the certificate exists.
resource "aws_route53_record" "certificate_validation" {
  for_each = {
    for option in aws_acm_certificate.this.domain_validation_options : option.domain_name => {
      name  = option.resource_record_name
      type  = option.resource_record_type
      value = option.resource_record_value
    }
  }

  zone_id         = aws_route53_zone.this.zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.value]
  allow_overwrite = true
}

# The waiter: completes when ACM has issued the certificate, so anything
# that depends on certificate_arn below waits for an issued certificate and
# a distribution is never created against a pending one.
resource "aws_acm_certificate_validation" "this" {
  certificate_arn         = aws_acm_certificate.this.arn
  validation_record_fqdns = [for record in aws_route53_record.certificate_validation : record.fqdn]
}
