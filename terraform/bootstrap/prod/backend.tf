# State lives in the heat-platform bucket, as every stack's does (decision
# 0008), under this environment's own key. The key is written here because
# this directory is the prod root and nothing else: no backend file, no flag.
terraform {
  backend "s3" {
    bucket       = "heat-platform-terraform-state"
    key          = "bootstrap/prod/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true
    encrypt      = true
  }
}
