# tflint: the Terraform linter beside `fmt` and `validate` in "Build and
# test" (docs/standards/terraform.md, rule 17), run over every root and
# module from this directory with `tflint --recursive`. The plugins pin their
# versions, as every dependency here does; Dependabot does not read this
# file, so a new release is taken by hand with the lock files' updates.

config {
  # Modules are linted as the roots call them, with the roots' arguments,
  # so a value a root passes is checked against the module's rules too.
  call_module_type = "all"
}

# The rules about Terraform itself: deprecated syntax, unused declarations,
# missing descriptions and types on variables, naming, required_version and
# required_providers.
plugin "terraform" {
  enabled = true
  preset  = "recommended"
}

# The rules about AWS resources: invalid values the provider accepts but the
# service refuses, deprecated arguments, and the like. Deep checking, which
# calls the AWS APIs with credentials, stays off: the pipeline's plan does
# that with the plan role.
plugin "aws" {
  enabled = true
  version = "0.50.0"
  source  = "github.com/terraform-linters/tflint-ruleset-aws"
}
