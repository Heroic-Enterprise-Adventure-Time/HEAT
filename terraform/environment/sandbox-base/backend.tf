# State lives in the heat-platform bucket, as every stack's does (decision
# 0008), under the sandbox account's prefix, beside the per-issue stacks'
# keys (decision 0019). The key is written here because this directory is
# the sandbox base and nothing else: no backend file, no flag. The sandbox
# plan and apply roles may read this key, and the apply role may write it,
# through the bucket's policy in the backend stack.
terraform {
  backend "s3" {
    bucket       = "heat-platform-terraform-state"
    key          = "environment/sandbox/base/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true
    encrypt      = true
  }
}
