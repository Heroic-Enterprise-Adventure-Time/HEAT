# State lives in the heat-platform bucket, as every stack's does (decision
# 0008). The key is per environment and is deliberately not written here: it
# comes from the environment's backend file, so that one configuration serves
# every environment with a state of its own.
#
#   terraform init -backend-config dev.s3.tfbackend
terraform {
  backend "s3" {
    bucket       = "heat-platform-terraform-state"
    region       = "us-east-1"
    use_lockfile = true
    encrypt      = true
  }
}
