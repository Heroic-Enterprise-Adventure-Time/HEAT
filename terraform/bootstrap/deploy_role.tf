# The narrow deploy role: what a GitHub Actions job in this repository's
# environment may do in the workload account, which is to put new code on
# existing functions and nothing else. The functions, their roles, triggers
# and aliases are the environment stack's; this role only moves code
# (decision 0011, as amended by 0012).

locals {
  # This repository's OIDC subject. Repositories created after 2026-07-15 use
  # GitHub's immutable subject format, which carries the organization's and
  # the repository's ids beside their names, so a rename or a transfer cannot
  # redirect the trust. The prefix was read from this repository's OIDC
  # customization endpoint on 2026-10-15:
  #   gh api repos/Heroic-Enterprise-Adventure-Time/HEAT/actions/oidc/customization/sub
  github_subject = "repo:Heroic-Enterprise-Adventure-Time@339832417/HEAT@1410947079:environment:${var.github_environment}"

  # Every function the environment stack creates is named
  # heat-<environment>-<name>. The trailing wildcard matches the function and
  # its versions and aliases; without it, only the unqualified ARN would match
  # and the alias actions would be refused.
  function_arns = "arn:aws:lambda:us-east-1:${var.workload_account_id}:function:heat-${var.environment}-*"
}

data "aws_iam_policy_document" "deploy_trust" {
  statement {
    sid     = "GitHubActionsThisRepositoryThisEnvironment"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [local.github_subject]
    }
  }
}

resource "aws_iam_role" "deploy" {
  provider = aws.workload

  name                 = "heat-${var.environment}-deploy"
  description          = "Assumed by GitHub Actions from the HEAT repository's ${var.github_environment} environment to update function code. Nothing else."
  assume_role_policy   = data.aws_iam_policy_document.deploy_trust.json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "deploy" {
  statement {
    sid    = "UpdateFunctionCodeAndMoveAlias"
    effect = "Allow"

    actions = [
      "lambda:UpdateFunctionCode",
      "lambda:PublishVersion",
      "lambda:GetFunction", # polled by `aws lambda wait function-updated-v2`
      "lambda:GetFunctionConfiguration",
      "lambda:GetAlias",
      "lambda:UpdateAlias",
    ]

    resources = [local.function_arns]
  }
}

# Inline rather than a managed policy: it has exactly one user and goes with
# the role.
resource "aws_iam_role_policy" "deploy" {
  provider = aws.workload

  name   = "update-function-code"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}
