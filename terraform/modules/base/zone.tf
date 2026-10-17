# The account's hosted zone. The organization layer, in the dcg-platform
# repository, delegates the name here by reading this zone's name servers
# itself and writing them into the parent zone's NS record (decision 0015,
# and the hand-off in decision 0018). Every record under the name is then
# this account's: the certificate's validation records (Issue-39), and one
# record per hostname.
#
# prevent_destroy, because a recreated zone gets four new name servers and
# the parent's NS record has a two-day TTL: replacing the zone costs a
# dcg-platform pull request and up to two days of a dead subdomain.
resource "aws_route53_zone" "this" {
  name    = var.zone_name
  comment = "${var.name_prefix}: delegated from dcg-games.com by the organization layer. Managed by Terraform; do not delete."

  lifecycle {
    prevent_destroy = true
  }
}
