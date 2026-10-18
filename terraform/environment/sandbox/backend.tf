# State lives in the heat-platform bucket, as every stack's does (decision
# 0008), under the sandbox account's prefix. The key is the one thing this
# block does not say: this one root serves every per-issue stack, and the
# key, environment/sandbox/<issue>/terraform.tfstate, is supplied at init by
# scripts/sandbox.mjs from the branch name (decision 0018, amending 0016 for
# this root only). The key and the stack's name derive from the same number,
# so the pair cannot mismatch.
terraform {
  backend "s3" {
    bucket       = "heat-platform-terraform-state"
    region       = "us-east-1"
    use_lockfile = true
    encrypt      = true
  }
}
