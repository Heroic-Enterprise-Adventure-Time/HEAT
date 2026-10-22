# The second alias, previous: the deploy before the current one, kept live
# beside it so that an adventure started under it is verified by the code
# that issued it (decision 0030). Every deploy publishes a version, because
# HEAT_VERSION changes with every commit, and moves live; previous takes
# the version live had before.
#
# Terraform cannot read a resource's old value in its own configuration,
# so previous learns what live was from data sources, read when Terraform
# plans, by name and not through the resources below, so nothing defers
# them to the apply:
#
#   1. The region's functions, to know whether this one exists yet. The
#      function data source fails on a function that does not exist
#      (provider source, function_data_source.go, read 2026-10-22), so it
#      is read only when the list names it. A stack's first apply has no
#      function: previous points at the new version with live.
#   2. The function at live: its version and its HEAT_VERSION. When that is
#      another commit, this deploy is new and previous takes live's version.
#   3. When live already carries this commit, the apply is a re-run of the
#      same deploy or a re-plan after it: previous stays where it is, read
#      from the function at previous. Without this a re-run would move
#      previous onto live and lose the deploy before, and a re-plan would
#      never be clean.
#
# The provider's documentation, d/lambda_function: qualifier is an "alias
# name or version number"; version and environment are exported. The plan
# and apply roles may read both (ReadOnlyAccess, AdministratorAccess).
# The data sources read the published configuration only, never data.

data "aws_lambda_functions" "existing" {}

locals {
  function_exists = {
    for name in keys(var.functions) : name => contains(data.aws_lambda_functions.existing.function_names, "${var.name_prefix}-${name}")
  }
}

data "aws_lambda_function" "live" {
  for_each = { for name, exists in local.function_exists : name => name if exists }

  function_name = "${var.name_prefix}-${each.key}"
  qualifier     = "live"
}

locals {
  live_app_version = {
    for name, fn in data.aws_lambda_function.live : name => try(fn.environment[0].variables["HEAT_VERSION"], "")
  }
}

data "aws_lambda_function" "previous" {
  for_each = { for name, deployed in local.live_app_version : name => name if deployed == var.app_version }

  function_name = "${var.name_prefix}-${each.key}"
  qualifier     = "previous"
}

locals {
  # Per function: the version previous points at, null for the version this
  # apply publishes, and the deploy's version that runs there. A version
  # published before Issue-113 has no HEAT_VERSION and gives "".
  previous = {
    for name in keys(var.functions) : name => (
      contains(keys(data.aws_lambda_function.previous), name) ? {
        version     = data.aws_lambda_function.previous[name].version
        app_version = try(data.aws_lambda_function.previous[name].environment[0].variables["HEAT_VERSION"], "")
        } : contains(keys(data.aws_lambda_function.live), name) ? {
        version     = data.aws_lambda_function.live[name].version
        app_version = local.live_app_version[name]
        } : {
        version     = null
        app_version = var.app_version
      }
    )
  }
}

resource "aws_lambda_alias" "previous" {
  for_each = var.functions

  name             = "previous"
  description      = "The deploy before the current one, which verifies the adventures it issued (decision 0030)."
  function_name    = aws_lambda_function.function[each.key].function_name
  function_version = coalesce(local.previous[each.key].version, aws_lambda_function.function[each.key].version)
}
