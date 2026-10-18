# State lives in the heat-platform bucket, as every stack's does (decision
# 0008), under the prod account's prefix, the one key the prod plan and apply
# roles may read and the apply role may write through the bucket's policy in
# the backend stack (decision 0019). The key is written here because this
# directory is prod and nothing else: no backend file, no flag (decision 0016).
terraform {
  backend "s3" {
    bucket       = "heat-platform-terraform-state"
    key          = "environment/prod/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true
    encrypt      = true
  }
}
