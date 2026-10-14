# This stack stores its own state in the bucket it creates. On the very first
# apply the bucket does not exist yet; README.md explains the override file that
# makes that first apply use local state, and the migration that follows.
terraform {
  backend "s3" {
    bucket       = "heat-platform-terraform-state"
    key          = "backend/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true
    encrypt      = true
  }
}
