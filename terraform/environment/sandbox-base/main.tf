# The sandbox base: what every per-issue stack in heat-sandbox shares, in one
# permanent root applied from main (decision 0018). One module call with the
# sandbox's values as literals (decision 0016); the dev and prod roots will
# compose the same module beside the environment module.
module "base" {
  source = "../../modules/base"

  name_prefix = "heat-sb-base"
  zone_name   = "heat-sb.dcg-games.com"
}
