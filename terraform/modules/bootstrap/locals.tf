# Names and values the roles, the boundary and the budget action share.
locals {
  # This repository's OIDC subject prefix. Repositories created after
  # 2026-07-15 use GitHub's immutable subject format, which carries the
  # organization's and the repository's ids beside their names, so a rename
  # or a transfer cannot redirect the trust. Read from this repository's OIDC
  # customization endpoint on 2026-10-15:
  #   gh api repos/Heroic-Enterprise-Adventure-Time/HEAT/actions/oidc/customization/sub
  github_subject_prefix = "repo:Heroic-Enterprise-Adventure-Time@339832417/HEAT@1410947079"

  # The prefix the environment stacks give their resources in this account:
  # heat-sb<issue> and heat-sb-base in the sandbox account (decision 0018),
  # heat-dev-* and heat-prod-* in the permanent ones. The boundary lets the
  # apply role write IAM roles and policies under this prefix and nothing
  # else.
  resource_prefix = var.environment == "sandbox" ? "heat-sb" : "heat-${var.environment}"

  # Where this account's environments keep their state in the platform
  # bucket: one prefix per account (decision 0008; the per-issue keys of
  # decision 0018 sit under the sandbox one). The bucket's policy in the
  # backend stack grants the two roles this prefix and nothing else.
  state_bucket     = "heat-platform-terraform-state"
  state_key_prefix = "environment/${var.environment}/"

  plan_role_name          = "heat-${var.environment}-plan"
  apply_role_name         = "heat-${var.environment}-apply"
  budget_action_role_name = "heat-${var.environment}-budget-action"
  boundary_policy_name    = "heat-${var.environment}-boundary"
  freeze_policy_name      = "heat-${var.environment}-freeze"

  # Built as strings where a resource cannot reference itself: the boundary
  # names its own ARN in the statement that makes new roles carry it.
  boundary_policy_arn = "arn:aws:iam::${var.workload_account_id}:policy/${local.boundary_policy_name}"
}
